import { successResponse, errorResponse, unauthorizedResponse } from '@/lib/api/response';
import { decreaseStorageUsage } from '@/lib/storage/accounts';
import { timingSafeEqual } from 'crypto';
import { z } from 'zod';
import { logger } from '@/lib/logger';

const DeletionCallbackSchema = z.object({
  photoId: z.string(),
  r2Deleted: z.boolean(),
  cloudinaryDeleted: z.boolean(),
  storageAccountId: z.string().optional(),
  // CRITICAL FIX C3: Accept string to avoid Number.MAX_SAFE_INTEGER precision loss.
  // Workers should send fileSize as a string (e.g. "12345678901234567890").
  // number is kept for backward compatibility during the transition.
  fileSize: z.union([z.string(), z.number()]).optional(),
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
      logger.info('webhook.deletion.confirmed', { photoId });

      if (storageAccountId && fileSize !== undefined) {
        let fileSizeBig: bigint;
        if (typeof fileSize === 'string') {
          fileSizeBig = BigInt(fileSize);
        } else {
          // number path — guard against precision loss for files > 9 PB
          if (fileSize > Number.MAX_SAFE_INTEGER) {
            logger.warn('webhook.deletion.fileSize_precision_loss', {
              photoId,
              fileSize,
              maxSafe: Number.MAX_SAFE_INTEGER,
            });
          }
          fileSizeBig = BigInt(Math.floor(fileSize));
        }
        await decreaseStorageUsage(storageAccountId, fileSizeBig);
        logger.info('webhook.deletion.storage_decreased', {
          photoId,
          storageAccountId,
          fileSize: fileSizeBig.toString(),
        });
      }
    } else {
      logger.error('webhook.deletion.failed', {
        photoId,
        r2Deleted,
        cloudinaryDeleted,
      });
    }

    return successResponse({ received: true });
  } catch (error) {
    logger.error('webhook.deletion.unhandled_error', { err: error });
    return errorResponse('Internal error', 500);
  }
}
