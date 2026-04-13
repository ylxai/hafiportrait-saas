import { successResponse, errorResponse, serverErrorResponse } from '@/lib/api/response';
import { prisma } from '@/lib/db';
import { publishPhotoThumbnailGenerated } from '@/lib/ably';
import { z } from 'zod';
import { timingSafeEqual } from 'node:crypto';

/**
 * Webhook handler for thumbnail generation callback from Cloudflare Workers
 *
 * This endpoint receives callback from Cloudflare Workers after they generate
 * thumbnails from R2 and upload to Cloudinary. We update the database and
 * broadcast real-time event.
 */

const thumbnailGeneratedSchema = z.object({
  photoId: z.string().min(1, 'photoId is required'),
  thumbnailUrl: z.string().url(),
  mediumUrl: z.string().url().optional(),
  smallUrl: z.string().url().optional(),
  publicId: z.string().min(1, 'publicId is required'),
});

function verifyWebhook(request: Request): boolean {
  const auth = request.headers.get('Authorization');
  const secret = process.env.VPS_WEBHOOK_SECRET || process.env.WEBHOOK_SECRET;
  if (!secret || !auth) return false;

  const expected = `Bearer ${secret}`;
  if (auth.length !== expected.length) return false;

  return timingSafeEqual(
    Buffer.from(auth),
    Buffer.from(expected)
  );
}

export async function POST(request: Request) {
  try {
    if (!verifyWebhook(request)) {
      return errorResponse('Unauthorized', 401);
    }

    const body = await request.json();

    const validation = thumbnailGeneratedSchema.safeParse(body);
    if (!validation.success) {
      console.error('[Webhook/Thumbnail] Invalid body:', validation.error.flatten());
      return errorResponse('Invalid webhook body: ' + validation.error.errors.map(e => e.message).join(', '), 400);
    }

    const { photoId, thumbnailUrl, mediumUrl: _mediumUrl, smallUrl: _smallUrl, publicId } = validation.data;

    console.log(`[Webhook/Thumbnail] Callback for photo ${photoId}: ${publicId}`);

    // Update the Photo record with thumbnail URLs
    const photo = await prisma.photo.update({
      where: { id: photoId },
      data: {
        thumbnailUrl,
        publicId,
        // Store medium/small URLs in metadata if needed (future: add columns)
        // For now, thumbnailUrl is the primary (400px)
      },
      select: {
        id: true,
        galleryId: true,
        thumbnailUrl: true,
        publicId: true,
        filename: true,
      },
    });

    if (!photo) {
      console.error(`[Webhook/Thumbnail] Photo ${photoId} not found`);
      return errorResponse('Photo not found', 404);
    }

    // Broadcast real-time event to dashboard
    if (photo.thumbnailUrl) {
      await publishPhotoThumbnailGenerated(photo.galleryId, {
        photoId: photo.id,
        thumbnailUrl: photo.thumbnailUrl,
        filename: photo.filename,
      });
    }

    return successResponse({
      success: true,
      message: 'Thumbnail updated',
      photoId: photo.id,
      thumbnailUrl: photo.thumbnailUrl,
    });
  } catch (error) {
    console.error('[Webhook/Thumbnail] Error handling thumbnail generation:', error);
    return serverErrorResponse('Failed to record thumbnail generation');
  }
}
