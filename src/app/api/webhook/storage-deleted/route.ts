import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { decreaseStorageUsage } from '@/lib/storage/accounts';
import { successResponse, errorResponse, serverErrorResponse } from '@/lib/api/response';

/**
 * Webhook handler for storage deletion callback from Cloudflare Workers
 * 
 * This endpoint receives callback from Cloudflare Workers after they delete
 * files from R2 and Cloudinary. We update the database and storage usage here.
 */

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
    const {
      photoId,
      r2Deleted,
      cloudinaryDeleted,
      storageAccountId,
      fileSize,
    } = body;

    console.log(`[Webhook] Storage deletion callback for photo ${photoId}:`, {
      r2Deleted,
      cloudinaryDeleted,
      storageAccountId,
    });

    // Update storage usage (decrease)
    if (storageAccountId && fileSize && r2Deleted) {
      try {
        await decreaseStorageUsage(storageAccountId, BigInt(fileSize));
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
