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

// Custom error for quota exceeded - allows transaction rollback
class QuotaExceededError extends Error {
  usedGB: number;
  quotaGB: number;
  constructor(message: string, usedGB: number, quotaGB: number) {
    super(message);
    this.name = 'QuotaExceededError';
    this.usedGB = usedGB;
    this.quotaGB = quotaGB;
  }
}

// Zod validation schema for upload complete request
const CompleteUploadSchema = z.object({
  uploadId: z.string().min(1, 'Upload ID is required'),
  width: z.number().int().min(0).optional().default(0),
  height: z.number().int().min(0).optional().default(0),
});

export async function POST(request: Request) {
  let galleryId: string | undefined;
  let r2Key: string | undefined;

  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return errorResponse('Unauthorized', 401);
    }

    // Rate limiting - prevent abuse of upload completion
    const userId = session.user.id || session.user.email || 'anonymous';
    const rateLimit = await checkRateLimit(`upload-complete:${userId}`, RATE_LIMITS.UPLOAD_COMPLETE);

    if (!rateLimit.success) {
      return errorResponse(
        'Terlalu banyak request. Silakan coba lagi nanti.',
        429,
        { 'Retry-After': Math.ceil((rateLimit.resetAt - Date.now()) / 1000).toString() }
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

    const { uploadId, width, height } = validation.data;

    const verification = await verifyR2Upload(uploadId, 0, width, height);
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
    const storageQuotaBytes = BigInt(storageQuotaGB * BYTES_PER_GB);

    const imgWidth = width || 0;
    const imgHeight = height || 0;

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

    // TRANSACTION: Atomic duplicate check + quota check + photo creation
    // This prevents race conditions where concurrent uploads could exceed quota
    const result = await prisma.$transaction(async (tx) => {
      // 1. DUPLICATE DETECTION: Check if file with same hash already exists in gallery
      let duplicateInfo: { isDuplicate: boolean; existingPhoto?: { id: string; filename: string; url: string } } = {
        isDuplicate: false,
      };

      if (photoFileHash) {
        const existingPhoto = await tx.photo.findFirst({
          where: {
            galleryId,
            fileHash: photoFileHash,
          },
          select: { id: true, filename: true, url: true, thumbnailUrl: true },
        });

        if (existingPhoto) {
          duplicateInfo = {
            isDuplicate: true,
            existingPhoto: {
              id: existingPhoto.id,
              filename: existingPhoto.filename,
              url: existingPhoto.thumbnailUrl || existingPhoto.url,
            },
          };
          console.warn(`[Duplicate Detection] Duplicate detected: ${photoFileHash} in gallery ${galleryId} (existing: ${existingPhoto.filename})`);
        }
      }

      // 2. QUOTA CHECK: Verify quota hasn't been exceeded (protects against race conditions)
      const storageUsage = await tx.photo.aggregate({
        where: {
          gallery: {
            event: {
              clientId,
            },
          },
        },
        _sum: {
          fileSize: true,
        },
      });

      const totalUsedStorage = storageUsage._sum.fileSize || BigInt(0);

      if (totalUsedStorage + BigInt(actualFileSize) > storageQuotaBytes) {
        const usedGB = Number(totalUsedStorage) / 1073741824;
        // Throw to rollback - Prisma will automatically rollback
        throw new QuotaExceededError(
          `Storage quota exceeded. Used: ${usedGB.toFixed(2)}GB / ${storageQuotaGB}GB`,
          usedGB,
          storageQuotaGB
        );
      }

      // 3. Create photo record
      const newPhoto = await tx.photo.create({
        data: {
          galleryId,
          filename,
          url: publicUrl,
          r2Key: verifiedR2Key,
          thumbnailUrl,
          publicId: null,
          width: imgWidth,
          height: imgHeight,
          fileSize: BigInt(actualFileSize),
          fileHash: photoFileHash,
          storageAccountId: storageAccountId || null,
          cloudinaryAccountId: cloudinaryAccountId || null,
        },
      });

      // 4. Update storage usage atomically
      if (storageAccountId) {
        await tx.storageAccount.update({
          where: { id: storageAccountId },
          data: {
            usedStorage: { increment: BigInt(actualFileSize) },
            totalPhotos: { increment: 1 },
          },
        });
      }

      return { photo: newPhoto, duplicateInfo };
    }).catch(async (err) => {
      // Handle quota exceeded - rollback R2 upload
      if (err instanceof QuotaExceededError) {
        if (verifiedR2Key) {
          try {
            const { credentials: r2Creds } = await getR2Credentials(storageAccountId || undefined);
            await deleteFromR2(verifiedR2Key, r2Creds);
          } catch (deleteErr) {
            console.error('Failed to rollback R2 upload:', deleteErr);
          }
        }
        await cleanupUploadSession(uploadId).catch(() => {});
        return { quotaExceeded: true, usedGB: err.usedGB, quotaGB: err.quotaGB } as const;
      }
      throw err; // Re-throw other errors
    });

    // Check if quota was exceeded (handled in catch block above)
    if ('quotaExceeded' in result) {
      return errorResponse(
        `Storage quota exceeded. Used: ${result.usedGB.toFixed(2)}GB / ${result.quotaGB}GB`,
        413
      );
    }

    const { photo, duplicateInfo } = result;

    // Stage 2: Queue async thumbnail generation (outside transaction - non-blocking)
    if (cloudinaryAccount?.cloudName && cloudinaryAccount.apiKey && cloudinaryAccount.apiSecret) {
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

    // Cleanup upload session (non-blocking)
    await cleanupUploadSession(uploadId);

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
      duplicate: duplicateInfo,
    });
  } catch (error) {
    console.error('Error completing upload:', error);

    // Track failed upload (non-blocking)
    if (galleryId) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      trackUploadResult(galleryId, false, errorMsg).catch(() => {});
    }

    // Cleanup on error
    if (r2Key && galleryId) {
      try {
        // Try to get storage account for cleanup
        const gallery = await prisma.gallery.findUnique({
          where: { id: galleryId },
          select: {
            photos: {
              where: { r2Key },
              select: { storageAccountId: true },
              take: 1,
            },
          },
        });
        if (gallery?.photos[0]?.storageAccountId) {
          const { credentials: r2Creds } = await getR2Credentials(gallery.photos[0].storageAccountId);
          await deleteFromR2(r2Key, r2Creds);
        }
      } catch {
        // Ignore cleanup errors
      }
    }

    return serverErrorResponse('Failed to complete upload');
  }
}
