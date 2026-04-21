import { successResponse, errorResponse, unauthorizedResponse } from '@/lib/api/response';
import { z } from 'zod';

const DeletionCallbackSchema = z.object({
  photoId: z.string(),
  success: z.boolean(),
  error: z.string().optional(),
});

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get('authorization');
    const expectedSecret = process.env.VPS_WEBHOOK_SECRET;

    if (!authHeader || !expectedSecret || authHeader !== `Bearer ${expectedSecret}`) {
      return unauthorizedResponse();
    }

    const body = await request.json();
    const validation = DeletionCallbackSchema.safeParse(body);

    if (!validation.success) {
      return errorResponse('Invalid payload', 400);
    }

    const { photoId, success, error } = validation.data;

    if (success) {
      console.log(`[Webhook] ✅ Deletion confirmed for ${photoId}`);
    } else {
      console.error(`[Webhook] ❌ Deletion failed for ${photoId}: ${error}`);
    }

    return successResponse({ received: true });
  } catch (error) {
    console.error('[Webhook] Deletion callback error:', error);
    return errorResponse('Internal error', 500);
  }
}
