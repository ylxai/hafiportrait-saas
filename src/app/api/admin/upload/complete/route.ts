import { successResponse, errorResponse, serverErrorResponse } from '@/lib/api/response';
import { verifyR2Upload, cleanupUploadSession, deleteFromR2, getR2Credentials } from '@/lib/upload/presigned';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';
import { prisma } from '@/lib/db';
import { updateStorageUsage, getStorageAccountById } from '@/lib/storage/accounts';
import { publishPhotoUploaded } from '@/lib/ably';
import { z } from 'zod';
import {
  STORAGE_QUOTA_PER_CLIENT_BYTES,
  STORAGE_QUOTA_PER_CLIENT_GB,
} from '@/lib/upload/constants';
import { generateThumbnailUrl, uploadToCloudinary } from '@/lib/storage/cloudinary';
import { getR2Client, R2Credentials } from '@/lib/storage/r2';
import { GetObjectCommand } from '@aws-sdk/client-s3';


// Fetch file from R2 and upload to Cloudinary for thumbnail generation
async function generateThumbnailForPhoto(
  r2Key: string,
  r2Credentials: R2Credentials,
  cloudinaryAccountId: string | null,
  galleryId: string,
  filename: string
): Promise<{ thumbnailUrl: string; publicId: string } | null> {
  try {
    // Get Cloudinary credentials
    if (!cloudinaryAccountId) {
      console.warn('[Thumbnail] No Cloudinary account specified, skipping thumbnail generation');
      return null;
    }

    const cloudinaryAccount = await getStorageAccountById(cloudinaryAccountId);
    if (!cloudinaryAccount || !cloudinaryAccount.cloudName || !cloudinaryAccount.apiKey || !cloudinaryAccount.apiSecret) {
      console.warn('[Thumbnail] Invalid Cloudinary account, skipping thumbnail generation');
      return null;
    }

    const cloudinaryCredentials = {
      cloudName: cloudinaryAccount.cloudName,
      apiKey: cloudinaryAccount.apiKey,
      apiSecret: cloudinaryAccount.apiSecret,
    };

    // Fetch file from R2
    const r2Client = getR2Client(r2Credentials);
    const getObjectCommand = new GetObjectCommand({
      Bucket: r2Credentials.bucketName,
      Key: r2Key,
    });

    const response = await r2Client.send(getObjectCommand);
    if (!response.Body) {
      console.error('[Thumbnail] Failed to fetch file from R2: empty body');
      return null;
    }

    const fileBuffer = Buffer.from(await response.Body.transformToByteArray());

    // Upload to Cloudinary
    const folder = `photos/${galleryId}`;
    const { publicId } = await uploadToCloudinary(fileBuffer, folder, cloudinaryCredentials);

    // Generate thumbnail URL
    const thumbnailUrl = generateThumbnailUrl(publicId, 400, 400, cloudinaryCredentials);

    console.log(`[Thumbnail] Generated thumbnail for ${filename}: ${publicId}`);
    return { thumbnailUrl, publicId };
  } catch (error) {
    console.error('[Thumbnail] Failed to generate thumbnail:', error);
    return null; // Graceful fallback
  }
}

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

    // RACE CONDITION FIX: Verify quota again before creating photo
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

      if (totalUsedStorage + BigInt(actualFileSize) > storageQuotaBytes) {
        // Rollback: delete the uploaded file from R2 using correct storage account
        if (r2Key) {
          try {
            // Get credentials for the specific storage account
            const { credentials: r2Creds } = await getR2Credentials(storageAccountId || undefined);
            await deleteFromR2(r2Key, r2Creds);
          } catch (err) {
            console.error('Failed to rollback R2 upload:', err);
          }
        }
        
        // Always cleanup session - if R2 delete failed, session remains for retry
        await cleanupUploadSession(uploadId).catch(() => {});
        
        const usedGB = (totalUsedStorage / BigInt(1073741824)).toString();
        const usedGBFloat = parseFloat(usedGB) + (Number(totalUsedStorage % BigInt(1073741824)) / 1073741824);
        return errorResponse(
          `Storage quota exceeded. Used: ${usedGBFloat.toFixed(2)}GB / ${STORAGE_QUOTA_PER_CLIENT_GB}GB`,
          413
        );
      }
    }

    const imgWidth = width || 0;
    const imgHeight = height || 0;

    // Generate thumbnail BEFORE creating photo record
    // Get the cloudinaryAccountId from the upload session
    const cloudinaryAccountId = verification.cloudinaryAccountId || null;

    // Fetch from R2 and upload to Cloudinary for thumbnail
    let thumbnailUrl: string | null = null;
    let publicId: string | null = null;

    if (r2Key) {
      const { credentials: r2Creds } = await getR2Credentials(storageAccountId || undefined);
      const thumbnail = await generateThumbnailForPhoto(
        r2Key,
        r2Creds,
        cloudinaryAccountId,
        galleryId,
        filename
      );

      if (thumbnail) {
        thumbnailUrl = thumbnail.thumbnailUrl;
        publicId = thumbnail.publicId;
      }
    }

    const photo = await prisma.photo.create({
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

    if (storageAccountId) {
      await updateStorageUsage(storageAccountId, BigInt(actualFileSize));
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
        fileSize: photo.fileSize?.toString() || null,
      },
    });
  } catch (error) {
    console.error('Error completing upload:', error);
    return serverErrorResponse('Failed to complete upload');
  }
}