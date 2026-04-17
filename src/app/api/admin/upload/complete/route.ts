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


// Zod validation schema for upload complete request
const CompleteUploadSchema = z.object({
  uploadId: z.string().min(1, 'Upload ID is required'),
  width: z.number().int().min(0).optional().default(0),
  height: z.number().int().min(0).optional().default(0),
});

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return errorResponse('Unauthorized', 401);
    }

    const body = await request.json();
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

    const { r2Key, publicUrl, filename, galleryId, storageAccountId, fileSize: serverFileSize, fileHash: sessionFileHash } = verification;

    if (!r2Key || !publicUrl || !filename || !galleryId) {
      return errorResponse('Invalid upload verification data', 400);
    }

    // Use server-side file size from R2 (NOT client-provided)
    const actualFileSize = serverFileSize || 0;
    if (actualFileSize === 0) {
      return errorResponse('Unable to verify file size from storage', 400);
    }

    // Use hash from session (NOT from client payload) - client cannot rewrite
    const photoFileHash = sessionFileHash || null;

    // DUPLICATE DETECTION: Check if file with same hash already exists in gallery
    if (photoFileHash) {
      const existingPhoto = await prisma.photo.findFirst({
        where: {
          galleryId,
          fileHash: photoFileHash,
        },
        select: { id: true, filename: true },
      });

      if (existingPhoto) {
        console.warn(`[Duplicate Detection] Potential duplicate: ${photoFileHash} in gallery ${galleryId} (existing: ${existingPhoto.filename})`);
      }
    }

    // RACE CONDITION FIX: Re-check quota with server-side file size
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

    if (gallery) {
      const clientId = gallery.event.clientId;
      const storageQuotaGB = gallery.event.client?.storageQuotaGB ?? DEFAULT_STORAGE_QUOTA_GB;
      const storageQuotaBytes = BigInt(storageQuotaGB * BYTES_PER_GB);

      const storageUsage = await prisma.photo.aggregate({
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
        // Rollback: delete the uploaded file from R2
        if (r2Key) {
          try {
            const { credentials: r2Creds } = await getR2Credentials(storageAccountId || undefined);
            await deleteFromR2(r2Key, r2Creds);
          } catch (err) {
            console.error('Failed to rollback R2 upload:', err);
          }
        }

        await cleanupUploadSession(uploadId).catch(() => {});

        const usedGB = Number(totalUsedStorage) / 1073741824;
        return errorResponse(
          `Storage quota exceeded. Used: ${usedGB.toFixed(2)}GB / ${storageQuotaGB}GB`,
          413
        );
      }
    }

    const imgWidth = width || 0;
    const imgHeight = height || 0;

    // Two-stage thumbnail strategy:
    // 1. IMMEDIATE: Construct Cloudinary image/fetch URL (works instantly, slow on first hit)
    // 2. ASYNC: Queue worker to upload real thumbnail to Cloudinary (replaces fetch URL)
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

    // publicId is null until worker generates real thumbnail
    const publicId: string | null = null;

    // TRANSACTION: Atomic photo creation + storage usage update
    const photo = await prisma.$transaction(async (tx) => {
      const newPhoto = await tx.photo.create({
        data: {
          galleryId,
          filename,
          url: publicUrl,
          r2Key: r2Key,
          thumbnailUrl,
          publicId,
          width: imgWidth,
          height: imgHeight,
          fileSize: BigInt(actualFileSize),
          fileHash: photoFileHash,
          storageAccountId: storageAccountId || null,
          cloudinaryAccountId: cloudinaryAccountId || null,
        },
      });

      // Update storage usage atomically
      if (storageAccountId) {
        await tx.storageAccount.update({
          where: { id: storageAccountId },
          data: {
            usedStorage: { increment: BigInt(actualFileSize) },
            totalPhotos: { increment: 1 },
          },
        });
      }

      return newPhoto;
    });

    // Stage 2: Queue async thumbnail generation
    // Worker will fetch from R2, upload to Cloudinary, and update DB
    if (cloudinaryAccount?.cloudName && cloudinaryAccount.apiKey && cloudinaryAccount.apiSecret) {
      await queueThumbnailGeneration({
        photoId: photo.id,
        r2Url: publicUrl,
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

    await publishPhotoUploaded(galleryId, {
      photoId: photo.id,
      filename: photo.filename,
      thumbnailUrl: thumbnailUrl,
    });

    await cleanupUploadSession(uploadId);

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
    });
  } catch (error) {
    console.error('Error completing upload:', error);
    return serverErrorResponse('Failed to complete upload');
  }
}