import { successResponse, errorResponse, unauthorizedResponse, validationError, handlePrismaError } from '@/lib/api/response';
import { prisma } from '@/lib/db';
import { z } from 'zod';
import { logger } from '@/lib/logger';
import { verifyWebhookSignature } from '@/lib/webhook-validation';
import { enforceBodySizeLimit, BODY_LIMITS } from '@/lib/api/body-size-limit';

const ThumbnailCallbackSchema = z.object({
  photoId: z.string(),
  thumbnailUrl: z.string().url(),
  publicId: z.string(),
});

export async function POST(request: Request) {
  try {
    // Reject oversized payloads before reading the body (Sprint 2 Task 2.3).
    const tooLarge = enforceBodySizeLimit(request, BODY_LIMITS.WEBHOOK);
    if (tooLarge) return tooLarge;

    const body = await request.text();
    const signature = request.headers.get('x-webhook-signature');
    const timestamp = request.headers.get('x-webhook-timestamp');

    // Verify HMAC-SHA256 signature and replay protection
    const validation = verifyWebhookSignature(body, signature, timestamp);
    if (!validation.valid) {
      logger.warn('webhook.thumbnail.auth_failed', {
        errorCode: validation.errorCode,
        error: validation.error,
      });
      return unauthorizedResponse();
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch {
      return errorResponse('Invalid JSON', 400);
    }

    const schemaValidation = ThumbnailCallbackSchema.safeParse(parsed);

    if (!schemaValidation.success) {
      return validationError(schemaValidation.error);
    }

    const { photoId, thumbnailUrl, publicId } = schemaValidation.data;

    await prisma.photo.update({
      where: { id: photoId },
      data: {
        thumbnailUrl,
        publicId,
      },
    });

    logger.info('webhook.thumbnail.updated', { photoId });
    return successResponse({ updated: true });
  } catch (error) {
    logger.error('[API] webhook.thumbnail.unhandled_error', { err: error });
    return handlePrismaError(error);
  }
}
