import { successResponse, errorResponse, serverErrorResponse } from '@/lib/api/response';
import { verifyR2Upload, cleanupUploadSession, deleteFromR2, getR2Credentials } from '@/lib/upload/presigned';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';
import { prisma } from '@/lib/db';
import { getStorageAccountById } from '@/lib/storage/accounts';
import { publishPhotoUploaded } from '@/lib/ably';
import { z } from 'zod';
import {
  DEFAULT_STORAGE_QUOTA_GB,
  BYTES_PER_GB,
} from '@/lib/upload/constants';
import { getCloudinaryThumbnailUrl } from '@/lib/cloudinary';
import { queueThumbnailGeneration } from '@/lib/cloudflare-queue';
import { trackUploadResult } from '@/lib/analytics';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { rateLimitResponse } from '@/lib/api/response';
import { logger } from '@/lib/logger';


// Zod validation schema for upload complete request
// HIGH FIX #8: removed width/height — client-supplied dimensions are not trusted.
// Dimensions are extracted server-side by the thumbnail worker and updated later.
const CompleteUploadSchema = z.object({
  uploadId: z.string().min(1, 'Upload ID is required'),
});

export async function POST(request: Request) {
  let galleryId: string | undefined;
  let r2Key: string | undefined;
  // HIGH FIX #9: track storageAccountId at outer scope so the outer catch can clean up orphan R2 file
  // even if the transaction fails before the photo row is created.
  let outerStorageAccountId: string | null | undefined;

  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return errorResponse('Unauthorized', 401);
    }

    // Rate limiting - prevent abuse of upload completion
    const userId = session.user.id || session.user.email || 'anonymous';
    const rateLimit = await checkRateLimit(`upload-complete:${userId}`, RATE_LIMITS.UPLOAD_COMPLETE);

    if (!rateLimit.success) {
      return rateLimitResponse(
        'Too many requests. Please try again later.',
        Math.ceil((rateLimit.resetAt - Date.now()) / 1000)
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return errorResponse('Invalid JSON body', 400);
    }

    const validation = CompleteUploadSchema.safeParse(body);
    if (!validation.success) {
      const firstError = validation.error.errors[0];
      return errorResponse(`${firstError.path.join('.')}: ${firstError.message}`, 400);
    }

    const { uploadId } = validation.data;

    const verification = await verifyR2Upload(uploadId);
    if (!verification.success) {
      return errorResponse(verification.error || 'Upload verification failed', 400);
    }

    const {
      r2Key: verifiedR2Key,
      publicUrl,
      filename,
      galleryId: gId,
      storageAccountId,
      fileSize: serverFileSize,
      fileHash: sessionFileHash,
    } = verification;

    if (!verifiedR2Key || !publicUrl || !filename || !gId) {
      return errorResponse('Invalid upload verification data', 400);
    }

    galleryId = gId;
    r2Key = verifiedR2Key;
    outerStorageAccountId = storageAccountId;

    // Use server-side file size from R2 (NOT client-provided)
    const actualFileSize = serverFileSize || 0;
    if (actualFileSize === 0) {
      return errorResponse('Unable to verify file size from storage', 400);
    }

    // Use hash from session (NOT from client payload) - client cannot rewrite.
    // MEDIUM FIX #4: hash is now REQUIRED at presigned-issuance time. Reject any
    // session that somehow lacks one — the unique `(galleryId, fileHash)` index
    // doesn't protect rows with NULL hash, leaving a race window.
    if (!sessionFileHash) {
      logger.warn('upload.complete.missing_hash', { uploadId, galleryId });
      return errorResponse('Upload session does not have fileHash; please upload again.', 400);
    }
    const photoFileHash = sessionFileHash;

    // Get gallery info for quota check
    const gallery = await prisma.gallery.findUnique({
      where: { id: galleryId },
      select: {
        event: {
          select: {
            clientId: true,
            client: {
              select: { storageQuotaGB: true },
            },
          },
        },
      },
    });

    if (!gallery) {
      return errorResponse('Gallery not found', 404);
    }

    const clientId = gallery.event.clientId;
    const storageQuotaGB = gallery.event.client?.storageQuotaGB ?? DEFAULT_STORAGE_QUOTA_GB;
    // MEDIUM FIX #14: Use BigInt arithmetic to avoid Number overflow on large quotas
    const storageQuotaBytes = BigInt(storageQuotaGB) * BigInt(BYTES_PER_GB);

    // HIGH FIX #8: dimensions are unknown here; thumbnail worker extracts real dimensions and updates the photo row.
    // Gemini cleanup: use null instead of magic 0 so width/height NULL means "unknown" (Prisma Int?).
    const imgWidth: number | null = null;
    const imgHeight: number | null = null;

    // Get Cloudinary account for thumbnail URL
    const cloudinaryAccountId = verification.cloudinaryAccountId || null;
    let thumbnailUrl: string | null = null;
    let cloudinaryAccount: Awaited<ReturnType<typeof getStorageAccountById>> | null = null;

    if (cloudinaryAccountId) {
      cloudinaryAccount = await getStorageAccountById(cloudinaryAccountId);
      if (cloudinaryAccount?.cloudName) {
        // Stage 1: Temporary fetch URL (will be replaced by worker)
        thumbnailUrl = getCloudinaryThumbnailUrl(publicUrl, {
          width: 400,
          height: 400,
          cloudName: cloudinaryAccount.cloudName,
        });
      }
    }

    // CRITICAL FIX #5: Atomic quota check via conditional update on Client.usedStorage.
    // Postgres "READ COMMITTED" + WHERE-clause guard makes the increment race-safe:
    // if usedStorage + fileSize > quota, no row is updated (count=0) → quota exceeded.
    const fileSizeBig = BigInt(actualFileSize);
    const quotaUpdate = await prisma.client.updateMany({
      where: {
        id: clientId,
        usedStorage: { lte: storageQuotaBytes - fileSizeBig },
      },
      data: { 
        usedStorage: { increment: fileSizeBig },
        photoCount: { increment: 1 },
      },
    });

    if (quotaUpdate.count === 0) {
      // Rollback orphaned R2 file & session
      try {
        const { credentials: r2Creds } = await getR2Credentials(storageAccountId || undefined);
        await deleteFromR2(verifiedR2Key, r2Creds);
      } catch (deleteErr) {
        logger.error('upload.complete.rollback_quota_failed', { uploadId, r2Key: verifiedR2Key, err: deleteErr });
      }
      await cleanupUploadSession(uploadId).catch(() => {});

      const currentUsage = await prisma.client.findUnique({
        where: { id: clientId },
        select: { usedStorage: true },
      });
      const usedGB = Number(currentUsage?.usedStorage ?? BigInt(0)) / BYTES_PER_GB;
      return errorResponse(
        `Storage quota exceeded. Used: ${usedGB.toFixed(2)}GB / ${storageQuotaGB}GB`,
        413
      );
    }

    // CRITICAL FIX #10 / PR #76 — Cross-gallery dedup per-client.
    //
    // The same client just uploaded the same file to a different gallery.
    // Instead of paying for a second copy in R2 + Cloudinary we reuse the
    // source photo's storage references and roll back this upload's
    // bytes. Net effect:
    //   - R2 holds exactly one copy of the file across the client's
    //     account (savings scale with how often the same gallery is
    //     re-imported into different galleries).
    //   - `Client.usedStorage` reflects unique bytes per client — ideal
    //     for tier / billing semantics.
    //   - The per-gallery `(galleryId, fileHash)` unique index still
    //     catches the same-gallery duplicate path below.
    //
    // We deliberately match on `clientId` (via `event`) so dedup never
    // crosses tenants. The `NOT: { galleryId }` predicate excludes the
    // row this request is about to create, leaving the existing P2002
    // catch responsible for the within-gallery case.
    const sourceDedupPhoto = await prisma.photo.findFirst({
      where: {
        fileHash: photoFileHash,
        gallery: { event: { clientId } },
        NOT: { galleryId },
      },
      // We need every storage-side field so the new row can be a true
      // pointer; nothing else.
      select: {
        r2Key: true,
        url: true,
        thumbnailUrl: true,
        publicId: true,
        width: true,
        height: true,
        fileSize: true,
        storageAccountId: true,
        cloudinaryAccountId: true,
      },
      orderBy: { createdAt: 'asc' }, // pick the oldest "source" row
    });

    if (sourceDedupPhoto && sourceDedupPhoto.r2Key) {
      // We already burned `fileSizeBig` worth of quota a few lines up;
      // give it back since the dedup path doesn't actually consume new
      // storage.
      //
      // Review #75-3 (CodeAnt): the previous version used a conditional
      // `updateMany({ where: { usedStorage: { gte: fileSizeBig } } })`
      // as a guard against driving `usedStorage` negative. The guard
      // works in isolation but creates a race window: if a concurrent
      // delete drops `usedStorage` below `fileSizeBig` between our
      // increment above and this decrement, the `gte` predicate fails
      // and we silently lose the rollback — the bytes stay charged
      // forever. We now check `count` and fall back to an unconditional
      // `update` so the rollback is never dropped. Driving below zero
      // is acceptable here; the next quota-gate `updateMany` clamps
      // back to a healthy state because subsequent increments use a
      // `lte: quota - size` predicate.
      const dedupRollback = await prisma.client.updateMany({
        where: { id: clientId, usedStorage: { gte: fileSizeBig } },
        data: { 
          usedStorage: { decrement: fileSizeBig },
          // NOTE: Do NOT decrement photoCount here - Photo record is still created at line 286
        },
      });
      if (dedupRollback.count === 0) {
        await prisma.client
          .update({
            where: { id: clientId },
            data: { 
              usedStorage: { decrement: fileSizeBig },
              // NOTE: Do NOT decrement photoCount here - Photo record is still created at line 286
            },
          })
          .catch((rollbackErr) => {
            logger.error('upload.complete.dedup.rollback_used_storage_failed', {
              clientId,
              err: rollbackErr,
            });
          });
      }

      // Discard the orphan R2 object the client just uploaded — the
      // canonical copy is `sourceDedupPhoto.r2Key`.
      try {
        const { credentials: r2Creds } = await getR2Credentials(storageAccountId || undefined);
        await deleteFromR2(verifiedR2Key, r2Creds);
      } catch (err) {
        // Non-fatal: the R2 file becomes a true orphan but the dedup
        // succeeds. R2 lifecycle rules will eventually reclaim it.
        logger.warn('upload.complete.dedup.cleanup_r2_failed', {
          uploadId,
          r2Key: verifiedR2Key,
          err,
        });
      }

      let dedupPhoto: Awaited<ReturnType<typeof prisma.photo.create>>;
      try {
        dedupPhoto = await prisma.photo.create({
          data: {
            galleryId: galleryId!,
            filename,
            // Reuse the source's storage references verbatim; the
            // resulting Photo row is effectively a hard-link.
            url: sourceDedupPhoto.url,
            r2Key: sourceDedupPhoto.r2Key,
            thumbnailUrl: sourceDedupPhoto.thumbnailUrl,
            publicId: sourceDedupPhoto.publicId,
            width: sourceDedupPhoto.width,
            height: sourceDedupPhoto.height,
            fileSize: sourceDedupPhoto.fileSize,
            fileHash: photoFileHash,
            storageAccountId: sourceDedupPhoto.storageAccountId,
            cloudinaryAccountId: sourceDedupPhoto.cloudinaryAccountId,
          },
        });
      } catch (err: unknown) {
        // P2002 = the row this request was about to create already
        // exists in this gallery (a concurrent same-gallery upload won
        // the race). Earlier the implementation re-threw the error
        // expecting the non-dedup `try/catch` block below to surface
        // the existing photo, but that catch is only reached from the
        // sibling `prisma.$transaction` path — re-throwing from inside
        // the dedup branch escapes all the way to the outer catch and
        // returns a 500. Review #75-1 (Gemini): handle P2002 inline.
        //
        // The rollback (`Client.usedStorage` decrement + uploaded R2
        // file removal) already ran above, so we only need to (a)
        // surface the existing photo's metadata and (b) clean up the
        // upload session so the user does not re-trigger the same
        // dedup attempt.
        const isDuplicate =
          typeof err === 'object' && err !== null && 'code' in err &&
          (err as { code?: string }).code === 'P2002';

        if (isDuplicate) {
          const existingPhoto = await prisma.photo.findUnique({
            where: { uniq_gallery_filehash: { galleryId: galleryId!, fileHash: photoFileHash } },
            select: {
              id: true,
              filename: true,
              url: true,
              thumbnailUrl: true,
              publicId: true,
              width: true,
              height: true,
              fileSize: true,
            },
          });
          if (existingPhoto) {
            logger.warn('upload.complete.dedup.duplicate_detected', {
              uploadId,
              galleryId,
              fileHash: photoFileHash,
              existingPhotoId: existingPhoto.id,
            });
            await cleanupUploadSession(uploadId).catch(() => {});
            return successResponse({
              photo: {
                id: existingPhoto.id,
                filename: existingPhoto.filename,
                url: existingPhoto.url,
                thumbnailUrl: existingPhoto.thumbnailUrl,
                publicId: existingPhoto.publicId,
                width: existingPhoto.width,
                height: existingPhoto.height,
                fileSize: existingPhoto.fileSize,
              },
              duplicate: {
                isDuplicate: true,
                existingPhoto: {
                  id: existingPhoto.id,
                  filename: existingPhoto.filename,
                  url: existingPhoto.thumbnailUrl || existingPhoto.url,
                },
              },
            });
          }
          // P2002 with no row visible to a follow-up read is unusual
          // but possible in extremely tight write windows. Fall
          // through to the generic 500 so the client retries.
        }
        // Anything else: rollback decrement was already applied for the
        // dedup path; surface a 500 so the user retries.
        logger.error('upload.complete.dedup.create_failed', { uploadId, galleryId, err });
        return errorResponse('Failed to save photo (dedup path)', 500);
      }

      logger.info('upload.complete.dedup.cross_gallery', {
        uploadId,
        galleryId,
        clientId,
        sharedR2Key: sourceDedupPhoto.r2Key,
        bytesSaved: sourceDedupPhoto.fileSize?.toString() ?? null,
      });
      await cleanupUploadSession(uploadId).catch(() => {});

      return successResponse({
        photo: {
          id: dedupPhoto.id,
          filename: dedupPhoto.filename,
          url: dedupPhoto.url,
          thumbnailUrl: dedupPhoto.thumbnailUrl,
          publicId: dedupPhoto.publicId,
          width: dedupPhoto.width,
          height: dedupPhoto.height,
          fileSize: dedupPhoto.fileSize,
        },
        // Caller-visible signal that this row reused storage; UI can
        // surface a "deduplicated" badge if it cares.
        duplicate: { isDuplicate: false, isCrossGalleryDedup: true },
      });
    }

    // CRITICAL FIX #4: Photo create — unique(galleryId, fileHash) catches duplicates atomically (P2002).
    // Wrap in transaction so storageAccount update rolls back if Photo create fails.
    let photo: Awaited<ReturnType<typeof prisma.photo.create>>;

    try {
      photo = await prisma.$transaction(async (tx) => {
        const newPhoto = await tx.photo.create({
          data: {
            galleryId: galleryId!,
            filename,
            url: publicUrl,
            r2Key: verifiedR2Key,
            thumbnailUrl,
            publicId: null,
            width: imgWidth,
            height: imgHeight,
            fileSize: fileSizeBig,
            fileHash: photoFileHash,
            storageAccountId: storageAccountId || null,
            cloudinaryAccountId: cloudinaryAccountId || null,
          },
        });

        if (storageAccountId) {
          await tx.storageAccount.update({
            where: { id: storageAccountId },
            data: {
              usedStorage: { increment: fileSizeBig },
              totalPhotos: { increment: 1 },
            },
          });
        }

        return newPhoto;
      });
    } catch (err: unknown) {
      // P2002 = unique constraint violation on (galleryId, fileHash) → duplicate
      const isDuplicate =
        typeof err === 'object' && err !== null && 'code' in err && (err as { code?: string }).code === 'P2002';

      // Rollback the conditional usedStorage increment we already applied above
      await prisma.client.update({
        where: { id: clientId },
        data: { 
          usedStorage: { decrement: fileSizeBig },
          photoCount: { decrement: 1 },
        },
      }).catch((e) => logger.error('upload.complete.rollback_used_storage_failed', { clientId, err: e }));

      // Always rollback the orphan R2 file
      try {
        const { credentials: r2Creds } = await getR2Credentials(storageAccountId || undefined);
        await deleteFromR2(verifiedR2Key, r2Creds);
      } catch (deleteErr) {
        logger.error('upload.complete.rollback_r2_failed', { uploadId, r2Key: verifiedR2Key, err: deleteErr });
      }
      await cleanupUploadSession(uploadId).catch(() => {});

      if (isDuplicate && photoFileHash) {
        // Review fix #3: return real metadata of the existing photo, not zero-filled placeholders.
        // Gemini cleanup: use findUnique on the composite unique index for index-only lookup.
        const existingPhoto = await prisma.photo.findUnique({
          where: { uniq_gallery_filehash: { galleryId, fileHash: photoFileHash } },
          select: {
            id: true,
            filename: true,
            url: true,
            thumbnailUrl: true,
            publicId: true,
            width: true,
            height: true,
            fileSize: true,
          },
        });
        if (existingPhoto) {
          logger.warn('upload.complete.duplicate_detected', { galleryId, fileHash: photoFileHash, existingPhotoId: existingPhoto.id });
          return successResponse({
            photo: {
              id: existingPhoto.id,
              filename: existingPhoto.filename,
              url: existingPhoto.url,
              thumbnailUrl: existingPhoto.thumbnailUrl,
              publicId: existingPhoto.publicId,
              width: existingPhoto.width,
              height: existingPhoto.height,
              // Gemini cleanup: successResponse() already serializes BigInt — pass raw value.
              fileSize: existingPhoto.fileSize,
            },
            duplicate: {
              isDuplicate: true,
              existingPhoto: {
                id: existingPhoto.id,
                filename: existingPhoto.filename,
                url: existingPhoto.thumbnailUrl || existingPhoto.url,
              },
            },
          });
        }
      }
      throw err;
    }

    // Stage 2: Queue async thumbnail generation (outside transaction - non-blocking)
    // Only queue if we have a cloudinary account configured
    if (cloudinaryAccountId && cloudinaryAccount?.cloudName && cloudinaryAccount.apiKey && cloudinaryAccount.apiSecret) {
      await queueThumbnailGeneration({
        photoId: photo.id,
        r2Key: verifiedR2Key,
        galleryId,
        filename,
        cloudinaryCredentials: {
          cloudName: cloudinaryAccount.cloudName,
          apiKey: cloudinaryAccount.apiKey,
          apiSecret: cloudinaryAccount.apiSecret,
        },
      }).catch((err) => {
        logger.error('upload.complete.queue_thumbnail_failed', { photoId: photo.id, err });
        // Non-critical — image/fetch URL still works as fallback
      });
    }

    // Publish event (non-blocking)
    await publishPhotoUploaded(galleryId, {
      photoId: photo.id,
      filename: photo.filename,
      thumbnailUrl,
    });

    // HIGH FIX #7: cleanup upload session non-blocking (don't await)
    cleanupUploadSession(uploadId).catch(() => {});

    // Track successful upload (non-blocking)
    trackUploadResult(galleryId, true).catch(() => {});

    return successResponse({
      photo: {
        id: photo.id,
        filename: photo.filename,
        url: photo.url,
        thumbnailUrl: photo.thumbnailUrl,
        publicId: photo.publicId,
        width: photo.width,
        height: photo.height,
        // Gemini cleanup: successResponse() already serializes BigInt — pass raw value.
        fileSize: photo.fileSize,
      },
      duplicate: { isDuplicate: false },
    });
  } catch (error) {
    logger.error('upload.complete.unhandled', { galleryId, r2Key, err: error });

    // Track failed upload (non-blocking)
    if (galleryId) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      trackUploadResult(galleryId, false, errorMsg).catch(() => {});
    }

    // HIGH FIX #9: orphan-cleanup uses tracked storageAccountId — works even if Photo was never created.
    if (r2Key) {
      try {
        const { credentials: r2Creds } = await getR2Credentials(outerStorageAccountId || undefined);
        await deleteFromR2(r2Key, r2Creds);
      } catch (cleanupErr) {
        logger.error('upload.complete.orphan_cleanup_failed', { r2Key, err: cleanupErr });
      }
    }

    return serverErrorResponse('Failed to complete upload');
  }
}
