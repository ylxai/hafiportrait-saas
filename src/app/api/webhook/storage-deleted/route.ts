import { successResponse, errorResponse, unauthorizedResponse, validationError, handlePrismaError } from '@/lib/api/response';
import { decreaseStorageUsage } from '@/lib/storage/accounts';
import { z } from 'zod';
import { logger } from '@/lib/logger';
import { verifyWebhookSignature } from '@/lib/webhook-validation';

/**
 * Coerce a fileSize input (string of digits OR safe integer number) into a
 * non-negative `bigint`. Returns `null` for any input the schema accepts but
 * that we cannot safely convert (negative number, fractional number, number
 * outside safe-integer range). Schema regex `^\d+$` already excludes
 * negative / fractional / non-numeric strings, so a string branch only
 * needs the non-negative check after BigInt parse — which can never throw
 * given the regex.
 */
function coerceFileSize(value: string | number): bigint | null {
  if (typeof value === 'string') {
    // Regex `^\d+$` guarantees BigInt(value) succeeds and is >= 0.
    return BigInt(value);
  }
  // number branch — must be a non-negative safe integer.
  if (!Number.isInteger(value) || value < 0 || value > Number.MAX_SAFE_INTEGER) {
    return null;
  }
  return BigInt(value);
}

const DeletionCallbackSchema = z.object({
  photoId: z.string(),
  r2Deleted: z.boolean(),
  cloudinaryDeleted: z.boolean(),
  storageAccountId: z.string().optional(),
  // CRITICAL FIX C3: accept either a numeric string (avoids precision loss
  // for files > Number.MAX_SAFE_INTEGER) OR a JS number, but constrain both
  // forms to non-negative integers so `BigInt()` cannot throw downstream.
  // - String form: `^\d+$` rejects signs, decimals, exponents, and leading
  //   `0x`/`0o`/`0b` prefixes. BigInt() is then guaranteed to succeed.
  // - Number form: must be a finite, non-negative safe integer. Rejecting
  //   fractional / out-of-range numbers here returns 400 (validation error)
  //   instead of letting them crash the handler at BigInt-conversion time.
  fileSize: z
    .union([
      z.string().regex(/^\d+$/, 'fileSize must be a non-negative integer string'),
      z
        .number()
        .int('fileSize number must be an integer')
        .nonnegative('fileSize must be non-negative')
        .max(Number.MAX_SAFE_INTEGER, 'fileSize exceeds safe integer range — use string'),
    ])
    .optional(),
});

export async function POST(request: Request) {
  try {
    const body = await request.text();
    const signature = request.headers.get('x-webhook-signature');
    const timestamp = request.headers.get('x-webhook-timestamp');

    // Verify HMAC-SHA256 signature and replay protection
    const validation = verifyWebhookSignature(body, signature, timestamp);
    if (!validation.valid) {
      logger.warn('webhook.deletion.auth_failed', {
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

    const schemaValidation = DeletionCallbackSchema.safeParse(parsed);

    if (!schemaValidation.success) {
      return validationError(schemaValidation.error);
    }

    const { photoId, r2Deleted, cloudinaryDeleted, storageAccountId, fileSize } = schemaValidation.data;

    const success = r2Deleted && cloudinaryDeleted;

    if (success) {
      logger.info('webhook.deletion.confirmed', { photoId });

      if (storageAccountId && fileSize !== undefined) {
        const fileSizeBig = coerceFileSize(fileSize);
        if (fileSizeBig === null) {
          // Should be unreachable: schema already rejects negative / fractional
          // / oversized numbers and non-numeric strings. Belt-and-suspenders
          // for callers that bypass schema validation in the future.
          logger.error('webhook.deletion.invalid_fileSize_post_schema', { photoId, fileSize });
          return errorResponse('Invalid fileSize value', 400);
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
    logger.error('[API] webhook.deletion.unhandled_error', { err: error });
    return handlePrismaError(error);
  }
}
