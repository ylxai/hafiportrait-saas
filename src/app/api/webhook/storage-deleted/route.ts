import { successResponse, errorResponse, unauthorizedResponse } from '@/lib/api/response';
import { decreaseStorageUsage } from '@/lib/storage/accounts';
import { timingSafeEqual } from 'crypto';
import { z } from 'zod';

const DeletionCallbackSchema = z.object({
  photoId: z.string(),
  r2Deleted: z.boolean(),
  cloudinaryDeleted: z.boolean(),
  storageAccountId: z.string().optional(),
  fileSize: z.number().optional(),
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
    const validation = DeletionCallbackSchema.safeParse(body);

    if (!validation.success) {
      return errorResponse('Invalid payload', 400);
    }

    const { photoId, r2Deleted, cloudinaryDeleted, storageAccountId, fileSize } = validation.data;

    const success = r2Deleted && cloudinaryDeleted;

    if (success) {
      console.log(`[Webhook] ✅ Deletion confirmed for ${photoId}`);
      
      if (storageAccountId && fileSize) {
        await decreaseStorageUsage(storageAccountId, BigInt(fileSize));
        console.log(`[Webhook] 📉 Decreased storage usage: ${fileSize} bytes`);
      }
    } else {
      console.error(`[Webhook] ❌ Deletion failed for ${photoId}: R2=${r2Deleted}, Cloudinary=${cloudinaryDeleted}`);
    }

    return successResponse({ received: true });
  } catch (error) {
    console.error('[Webhook] Deletion callback error:', error);
    return errorResponse('Internal error', 500);
  }
}
