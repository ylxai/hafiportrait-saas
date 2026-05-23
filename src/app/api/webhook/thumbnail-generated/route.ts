import { successResponse, errorResponse, unauthorizedResponse } from '@/lib/api/response';
import { prisma } from '@/lib/db';
import { timingSafeEqual } from 'crypto';
import { z } from 'zod';

const ThumbnailCallbackSchema = z.object({
  photoId: z.string(),
  thumbnailUrl: z.string().url(),
  publicId: z.string(),
});

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get('authorization');
    const expectedSecret = process.env.VPS_WEBHOOK_SECRET;

    if (!authHeader || !expectedSecret) {
      return unauthorizedResponse();
    }

    const receivedSecret = authHeader.replace('Bearer ', '');
    if (
      receivedSecret.length !== expectedSecret.length ||
      !timingSafeEqual(Buffer.from(receivedSecret), Buffer.from(expectedSecret))
    ) {
      return unauthorizedResponse();
    }

    const body = await request.json();
    const validation = ThumbnailCallbackSchema.safeParse(body);

    if (!validation.success) {
      return errorResponse('Invalid payload', 400);
    }

    const { photoId, thumbnailUrl, publicId } = validation.data;

    await prisma.photo.update({
      where: { id: photoId },
      data: {
        thumbnailUrl,
        publicId,
      },
    });

    console.log(`[Webhook] ✅ Thumbnail updated for ${photoId}`);
    return successResponse({ updated: true });
  } catch (error) {
    console.error('[Webhook] Thumbnail callback error:', error);
    return errorResponse('Internal error', 500);
  }
}
