import { decreaseStorageUsage } from '@/lib/storage/accounts';
import { successResponse, errorResponse, serverErrorResponse } from '@/lib/api/response';
import { z } from 'zod';

/**
 * Webhook handler for storage deletion callback from Cloudflare Workers
 * 
 * This endpoint receives callback from Cloudflare Workers after they delete
 * files from R2 and Cloudinary. We update the database and storage usage here.
 */

// Schema validation for webhook body
const storageDeletedSchema = z.object({
  photoId: z.string().min(1, 'photoId is required'),
  r2Deleted: z.boolean().optional(),
  cloudinaryDeleted: z.boolean().optional(),
  storageAccountId: z.string().optional(),
  fileSize: z.union([z.number(), z.string()]).optional(),
});

// Verify webhook secret
function verifyWebhook(request: Request): boolean {
  const auth = request.headers.get('Authorization');
  return auth === `Bearer ${process.env.WEBHOOK_SECRET}`;
}

/**
 * POST /api/webhook/storage-deleted
 * 
 * Called by Cloudflare Workers after deleting photo from storage
 */
export async function POST(request: Request) {
  try {
    if (!verifyWebhook(request)) {
      return errorResponse('Unauthorized', 401);
    }

    const body = await request.json();
    
    // Validate body schema
    const validation = storageDeletedSchema.safeParse(body);
    if (!validation.success) {
      console.error('[Webhook] Invalid body schema:', validation.error.flatten());
      return errorResponse('Invalid webhook body: ' + validation.error.errors.map(e => e.message).join(', '), 400);
    }

    const { 
      photoId,
      r2Deleted,
      storageAccountId,
      fileSize,
    } = validation.data;

    console.log(`[Webhook] Storage deletion callback for photo ${photoId}:`, {
      r2Deleted,
      storageAccountId,
    });

    // Update storage usage (decrease)
    if (storageAccountId && fileSize !== undefined && r2Deleted) {
      try {
        // BigInt() handles both string and number types
        const size = BigInt(fileSize);
        await decreaseStorageUsage(storageAccountId, size);
        console.log(`[Webhook] Storage usage decreased for account ${storageAccountId}`);
      } catch (error) {
        console.error('[Webhook] Failed to update storage usage:', error);
        // Don't fail the webhook - storage usage can be recalculated later
      }
    }

    return successResponse({
      success: true,
      message: 'Storage deletion recorded',
      photoId,
      storageUpdated: !!storageAccountId,
    });
  } catch (error) {
    console.error('[Webhook] Error handling storage deletion:', error);
    return serverErrorResponse('Failed to record storage deletion');
  }
}
