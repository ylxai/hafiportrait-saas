import { successResponse, serverErrorResponse, errorResponse } from '@/lib/api/response';
import { getAccountsNeedingRotation, rotateStorageCredentials } from '@/lib/storage/rotation';
import { timingSafeEqual } from 'crypto';
import { withRequestContext } from '@/lib/with-request-context';
import { logger } from '@/lib/logger';

/**
 * POST /api/admin/storage-accounts/rotation/cron
 *
 * Triggered by an external cron scheduler (Cloudflare Cron Triggers / cron-job.org).
 * Finds all accounts with rotationEnabled=true and rotationNextDate <= now,
 * then rotates their credentials automatically.
 *
 * Authorization: Bearer token from VPS_WEBHOOK_SECRET (same secret as webhooks).
 *
 * Setup in DEPLOYMENT.md — call this endpoint daily at 00:05 UTC.
 */
export const POST = withRequestContext(async (request: Request) => {
  try {
    // Validate cron secret (reuse VPS_WEBHOOK_SECRET)
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.VPS_WEBHOOK_SECRET;

    if (!cronSecret) {
      logger.error('rotation_cron.secret_not_configured', {});
      return serverErrorResponse('Server misconfiguration');
    }

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return errorResponse('Unauthorized', 401);
    }

    const expected = `Bearer ${cronSecret}`;
    
    // Check length before timingSafeEqual (throws on different lengths)
    if (authHeader.length !== expected.length) {
      return errorResponse('Unauthorized', 401);
    }

    const isValid = timingSafeEqual(
      Buffer.from(authHeader),
      Buffer.from(expected)
    );

    if (!isValid) {
      return errorResponse('Unauthorized', 401);
    }

    // Find all accounts due for rotation
    const accountIds = await getAccountsNeedingRotation();

    if (accountIds.length === 0) {
      return successResponse({ rotated: 0, message: 'No accounts due for rotation' });
    }

    const results: { accountId: string; success: boolean; error?: string }[] = [];

    for (const accountId of accountIds) {
      const result = await rotateStorageCredentials(accountId, 'auto');
      results.push({ accountId, ...result });

      if (!result.success) {
        logger.error('rotation_cron.rotate_failed', { accountId, error: result.error });
      } else {
        logger.info('rotation_cron.rotate_success', { accountId });
      }
    }

    const succeeded = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    return successResponse({
      rotated: succeeded,
      failed,
      results,
    });
  } catch (error) {
    logger.error('rotation_cron.unexpected_error', { err: error });
    return serverErrorResponse('Auto-rotation cron failed');
  }
});
