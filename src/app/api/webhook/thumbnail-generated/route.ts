import { successResponse, errorResponse, serverErrorResponse } from '@/lib/api/response';
import { prisma } from '@/lib/db';
import { publishPhotoThumbnailGenerated } from '@/lib/ably';
import { verifyWebhookSignature } from '@/lib/webhook-validation';
import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

/**
 * Webhook handler for thumbnail generation callback from Cloudflare Workers
 *
 * This endpoint receives callback from Cloudflare Workers after they generate
 * thumbnails from R2 and upload to Cloudinary. We update the database and
 * broadcast real-time event.
 * 
 * Security: Uses HMAC-SHA256 signature verification with timestamp validation
 */

const thumbnailGeneratedSchema = z.object({
  photoId: z.string().min(1, 'photoId is required'),
  thumbnailUrl: z.string().url(),
  mediumUrl: z.string().url().optional(),
  smallUrl: z.string().url().optional(),
  publicId: z.string().min(1, 'publicId is required'),
});

export async function POST(request: Request) {
  try {
    // Get raw body for signature verification
    const body = await request.text();
    const signature = request.headers.get('x-webhook-signature');
    const timestamp = request.headers.get('x-webhook-timestamp');
    
    // Verify webhook signature and timestamp
    const validation = verifyWebhookSignature(body, signature, timestamp);

    // Backward-compat: accept legacy Bearer auth only when explicitly enabled
    const allowLegacyAuth = process.env.ALLOW_LEGACY_WEBHOOK_AUTH === 'true';
    const authHeader = request.headers.get('authorization');
    const legacySecret = process.env.VPS_WEBHOOK_SECRET;
    let legacyAuthorized = false;
    if (allowLegacyAuth && authHeader && legacySecret) {
      const expected = `Bearer ${legacySecret}`;
      if (authHeader.length === expected.length) {
        legacyAuthorized = timingSafeEqual(Buffer.from(authHeader), Buffer.from(expected));
      }
    }

    if (!validation.valid && !legacyAuthorized) {
      console.warn('[Webhook/Thumbnail] Validation failed:', validation.error);
      return errorResponse(validation.error || 'Unauthorized', 401);
    }

    let data: unknown;
    try {
      data = JSON.parse(body);
    } catch {
      return errorResponse('Invalid JSON body', 400);
    }

    const payloadValidation = thumbnailGeneratedSchema.safeParse(data);
    if (!payloadValidation.success) {
      console.error('[Webhook/Thumbnail] Invalid body:', payloadValidation.error.flatten());
      return errorResponse('Invalid webhook body: ' + payloadValidation.error.errors.map(e => e.message).join(', '), 400);
    }

    const { photoId, thumbnailUrl, mediumUrl: _mediumUrl, smallUrl: _smallUrl, publicId } = payloadValidation.data;

    console.log(`[Webhook/Thumbnail] Callback for photo ${photoId}: ${publicId}`);

    // Update the Photo record with thumbnail URLs
    let photo;
    try {
      photo = await prisma.photo.update({
        where: { id: photoId },
        data: {
          thumbnailUrl,
          publicId,
        },
        select: {
          id: true,
          galleryId: true,
          thumbnailUrl: true,
          publicId: true,
          filename: true,
        },
      });
    } catch (error) {
      // Prisma P2025: Record not found
      console.error(`[Webhook/Thumbnail] Photo ${photoId} not found:`, error);
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
