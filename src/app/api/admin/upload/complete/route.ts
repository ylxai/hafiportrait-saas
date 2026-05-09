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
import { serializeBigInt } from '@/lib/bigint-utils';
import { trackUploadResult } from '@/lib/analytics';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { rateLimitResponse } from '@/lib/api/response';


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
        'Terlalu banyak request. Silakan coba lagi nanti.',
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

    // Use hash from session (NOT from client payload) - client cannot rewrite
    const photoFileHash = sessionFileHash || null;

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

    // HIGH FIX #8: dimensions are 0 here; thumbnail worker extracts real dimensions and updates the photo row.
    const imgWidth = 0;
    const imgHeight = 0;

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
      data: { usedStorage: { increment: fileSizeBig } },
    });

    if (quotaUpdate.count === 0) {
      // Rollback orphaned R2 file & session
      try {
        const { credentials: r2Creds } = await getR2Credentials(storageAccountId || undefined);
        await deleteFromR2(verifiedR2Key, r2Creds);
      } catch (deleteErr) {
        console.error('Failed to rollback R2 upload after quota exceeded:', deleteErr);
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
        data: { usedStorage: { decrement: fileSizeBig } },
      }).catch((e) => console.error('Failed to rollback Client.usedStorage:', e));

      // Always rollback the orphan R2 file
      try {
        const { credentials: r2Creds } = await getR2Credentials(storageAccountId || undefined);
        await deleteFromR2(verifiedR2Key, r2Creds);
      } catch (deleteErr) {
        console.error('Failed to rollback R2 upload:', deleteErr);
      }
      await cleanupUploadSession(uploadId).catch(() => {});

      if (isDuplicate && photoFileHash) {
        const existingPhoto = await prisma.photo.findFirst({
          where: { galleryId, fileHash: photoFileHash },
          select: { id: true, filename: true, url: true, thumbnailUrl: true },
        });
        if (existingPhoto) {
          console.warn(`[Duplicate Detection] Duplicate (race-safe): ${photoFileHash} in gallery ${galleryId}`);
          return successResponse({
            photo: {
              id: existingPhoto.id,
              filename: existingPhoto.filename,
              url: existingPhoto.url,
              thumbnailUrl: existingPhoto.thumbnailUrl,
              publicId: null,
              width: 0,
              height: 0,
              fileSize: '0',
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
        console.error('[Upload] Failed to queue thumbnail generation:', err);
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
        fileSize: serializeBigInt(photo.fileSize),
      },
      duplicate: { isDuplicate: false },
    });
  } catch (error) {
    console.error('Error completing upload:', error);

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
        console.error('Failed to clean up orphan R2 file:', cleanupErr);
      }
    }

    return serverErrorResponse('Failed to complete upload');
  }
}
