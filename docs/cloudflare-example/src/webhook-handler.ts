import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { updateStorageUsage, decreaseStorageUsage } from '@/lib/storage/accounts';
import { publishPhotoUploaded } from '@/lib/ably';
import { successResponse, errorResponse, serverErrorResponse } from '@/lib/api/response';

/**
 * Webhook handler untuk menerima callback dari Cloudflare Workers
 * Setelah thumbnail generation atau storage deletion selesai
 */

// Verify webhook secret
function verifyWebhook(request: Request): boolean {
  const auth = request.headers.get('Authorization');
  return auth === `Bearer ${process.env.WEBHOOK_SECRET}`;
}

/**
 * POST /api/webhook/photo-created
 * Dipanggil oleh Cloudflare Worker setelah thumbnail berhasil dibuat
 */
export async function POST_photoCreated(request: Request) {
  try {
    if (!verifyWebhook(request)) {
      return errorResponse('Unauthorized', 401);
    }

    const data = await request.json();
    const {
      uploadId,
      galleryId,
      filename,
      url,
      thumbnailUrl,
      publicId,
      width,
      height,
      fileSize,
      storageAccountId,
      r2Key,
    } = data;

    // 1. Create photo record in database
    const photo = await prisma.photo.create({
      data: {
        id: crypto.randomUUID(),
        galleryId,
        filename,
        url,
        thumbnailUrl,
        publicId,
        r2Key,
        width: width || null,
        height: height || null,
        fileSize: BigInt(fileSize),
        storageAccountId: storageAccountId || null,
      },
    });

    // 2. Update storage usage
    if (storageAccountId) {
      await updateStorageUsage(storageAccountId, BigInt(fileSize));
    }

    // 3. Update upload session in Redis (optional)
    // await updateUploadProgress(uploadId, { status: 'completed', photoId: photo.id });

    // 4. Notify client via Ably
    await publishPhotoUploaded(galleryId, {
      photoId: photo.id,
      filename: photo.filename,
      thumbnailUrl: photo.thumbnailUrl,
    });

    console.log(`[Webhook] Photo created: ${photo.id} for gallery ${galleryId}`);

    return successResponse({
      success: true,
      photoId: photo.id,
      uploadId,
    });
  } catch (error) {
    console.error('[Webhook] Error creating photo:', error);
    return serverErrorResponse('Failed to create photo record');
  }
}

/**
 * POST /api/webhook/storage-deleted
 * Dipanggil oleh Cloudflare Worker setelah storage cleanup selesai
 */
export async function POST_storageDeleted(request: Request) {
  try {
    if (!verifyWebhook(request)) {
      return errorResponse('Unauthorized', 401);
    }

    const data = await request.json();
    const {
      photoId,
      r2Deleted,
      cloudinaryDeleted,
      storageAccountId,
      fileSize,
    } = data;

    // Update storage usage (decrease)
    if (storageAccountId && fileSize) {
      await decreaseStorageUsage(storageAccountId, BigInt(fileSize));
    }

    console.log(`[Webhook] Storage deleted for photo ${photoId}:`, {
      r2Deleted,
      cloudinaryDeleted,
      storageAccountId,
    });

    return successResponse({
      success: true,
      photoId,
      storageUpdated: !!storageAccountId,
    });
  } catch (error) {
    console.error('[Webhook] Error updating storage:', error);
    return serverErrorResponse('Failed to update storage usage');
  }
}

// Main handler dengan routing
export async function POST(request: Request) {
  const url = new URL(request.url);
  const path = url.pathname;

  if (path.endsWith('/photo-created')) {
    return POST_photoCreated(request);
  }

  if (path.endsWith('/storage-deleted')) {
    return POST_storageDeleted(request);
  }

  return errorResponse('Unknown webhook endpoint', 404);
}
