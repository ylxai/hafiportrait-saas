import { successResponse, errorResponse, serverErrorResponse } from '@/lib/api/response';
import { verifyR2Upload, cleanupUploadSession } from '@/lib/upload/presigned';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';
import { prisma } from '@/lib/db';
import { updateStorageUsage } from '@/lib/storage/accounts';
import { publishPhotoUploaded } from '@/lib/ably';
import { z } from 'zod';
import {
  STORAGE_QUOTA_PER_CLIENT_BYTES,
  STORAGE_QUOTA_PER_CLIENT_GB,
} from '@/lib/upload/constants';


// Zod validation schema for upload complete request
const CompleteUploadSchema = z.object({
  uploadId: z.string().min(1, 'Upload ID is required'),
  fileSize: z.number().int().positive('File size must be positive'),
  width: z.number().int().min(0).optional().default(0),
  height: z.number().int().min(0).optional().default(0),
  fileHash: z.string().optional(), // Optional SHA-256 hash for integrity/duplicate detection
});

// Complete upload: Verify R2 upload dan save metadata
// Thumbnail akan di-generate on-demand oleh Cloudinary (auto-fetch dari R2 public URL)
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return errorResponse('Unauthorized', 401);
    }

    // Parse and validate request body with Zod
    const body = await request.json();
    const validation = CompleteUploadSchema.safeParse(body);
    
    if (!validation.success) {
      const firstError = validation.error.errors[0];
      return errorResponse(`${firstError.path.join('.')}: ${firstError.message}`, 400);
    }

    const { uploadId, fileSize, width, height, fileHash } = validation.data;

    // Verifikasi upload ke R2 berhasil
    const verification = await verifyR2Upload(uploadId, fileSize, width, height);

    if (!verification.success) {
      return errorResponse(verification.error || 'Upload verification failed', 400);
    }

    const { r2Key, publicUrl, filename, galleryId, storageAccountId } = verification;

    if (!r2Key || !publicUrl || !filename || !galleryId) {
      return errorResponse('Invalid upload verification data', 400);
    }

    // FILE INTEGRITY FIX: If client provided hash, verify it matches
    // Note: Full verification requires uploading hash to R2 or comparing on download
    // For now, we store the hash for duplicate detection and future integrity checks
    const photoFileHash = fileHash || null;

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
        // Don't block upload, but log for admin review
        console.warn(`[Duplicate Detection] Potential duplicate: ${photoFileHash} in gallery ${galleryId} (existing: ${existingPhoto.filename})`);
      }
    }

    // RACE CONDITION FIX: Verify quota again before creating photo
    // Get client ID from gallery
    const gallery = await prisma.gallery.findUnique({
      where: { id: galleryId },
      select: {
        event: {
          select: {
            clientId: true,
          },
        },
      },
    });

    if (gallery) {
      const clientId = gallery.event.clientId;
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
      const storageQuotaBytes = BigInt(STORAGE_QUOTA_PER_CLIENT_BYTES);

      if (totalUsedStorage + BigInt(fileSize) > storageQuotaBytes) {
        // Rollback: delete the uploaded file from R2
        await cleanupUploadSession(uploadId);
        const usedGB = (totalUsedStorage / BigInt(1073741824)).toString();
        const usedGBFloat = parseFloat(usedGB) + (Number(totalUsedStorage % BigInt(1073741824)) / 1073741824);
        return errorResponse(
          `Storage quota exceeded. Used: ${usedGBFloat.toFixed(2)}GB / ${STORAGE_QUOTA_PER_CLIENT_GB}GB`,
          413
        );
      }
    }

    // Get image dimensions if not provided
    const imgWidth = width || 0;
    const imgHeight = height || 0;

    // Create photo record - NO THUMBNAIL GENERATION NEEDED
    // Cloudinary will auto-fetch from R2 public URL on-demand
    const photo = await prisma.photo.create({
      data: {
        galleryId,
        filename,
        url: publicUrl, // R2 public URL (original)
        r2Key: r2Key,
        width: imgWidth,
        height: imgHeight,
        fileSize: BigInt(fileSize),
        fileHash: photoFileHash, // Store hash for duplicate detection
        storageAccountId: storageAccountId || null,
        // thumbnailUrl will be generated on-the-fly by Cloudinary
      },
    });

    // Update storage usage
    if (storageAccountId) {
      await updateStorageUsage(storageAccountId, BigInt(fileSize));
    }

    // Notify client via Ably
    await publishPhotoUploaded(galleryId, {
      photoId: photo.id,
      filename: photo.filename,
      thumbnailUrl: null, // Will be generated on-demand
    });

    // Cleanup session
    await cleanupUploadSession(uploadId);

    return successResponse({
      photo: {
        id: photo.id,
        filename: photo.filename,
        url: photo.url,
        width: photo.width,
        height: photo.height,
        fileSize: photo.fileSize?.toString() || null,
        // Note: thumbnail will be generated by Cloudinary on first view
      },
    });
  } catch (error) {
    console.error('Error completing upload:', error);
    return serverErrorResponse('Failed to complete upload');
  }
}
