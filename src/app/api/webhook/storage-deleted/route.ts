import { successResponse, errorResponse, unauthorizedResponse, validationError, handlePrismaError } from '@/lib/api/response';
import { decreaseStorageUsage } from '@/lib/storage/accounts';
import { z } from 'zod';
import { logger } from '@/lib/logger';
import { verifyWebhookSignature } from '@/lib/webhook-validation';

// Hard upper bound on the string form of `fileSize`. 32 digits is more
// than enough for any realistic byte count (a 32-digit value is ~10^32
// bytes, far beyond the size of all data ever produced). Capping the
// length at the schema layer prevents a DoS where a megabyte-long
// digit string would force `BigInt(value)` into pathological CPU /
// memory work before the route can return a 422 validation error.
// (CodeAnt PR #107 MAJOR security finding.)
const MAX_FILESIZE_DIGITS = 32;

const DeletionCallbackSchema = z.object({
  photoId: z.string(),
  r2Deleted: z.boolean(),
  cloudinaryDeleted: z.boolean(),
  storageAccountId: z.string().optional(),
  // CRITICAL FIX C3: accept either a digit-only string (avoids precision
  // loss for files > Number.MAX_SAFE_INTEGER) OR a JS number, but
  // constrain both forms to non-negative integers AND transform inline
  // so `schemaValidation.data.fileSize` is already a `bigint` (or
  // undefined). Centralizing the conversion here removes the runtime
  // helper that previously had to mirror these checks.
  // - String form: `^\d+$` rejects signs, decimals, exponents, hex/oct/
  //   bin prefixes. `.max(MAX_FILESIZE_DIGITS)` blocks DoS via huge
  //   digit strings. `.transform(BigInt)` then converts safely.
  // - Number form: must be a finite, non-negative safe integer. The
  //   transform always yields a non-negative bigint.
  fileSize: z
    .union([
      z
        .string()
        .max(MAX_FILESIZE_DIGITS, `fileSize string exceeds ${MAX_FILESIZE_DIGITS}-digit limit`)
        .regex(/^\d+$/, 'fileSize must be a non-negative integer string')
        .transform((v) => BigInt(v)),
      z
        .number()
        .int('fileSize number must be an integer')
        .nonnegative('fileSize must be non-negative')
        .max(Number.MAX_SAFE_INTEGER, 'fileSize exceeds safe integer range — use string')
        .transform((v) => BigInt(v)),
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

    // After schema validation `fileSize` is `bigint | undefined`.
    const { photoId, r2Deleted, cloudinaryDeleted, storageAccountId, fileSize } = schemaValidation.data;

    const success = r2Deleted && cloudinaryDeleted;

    if (success) {
      logger.info('webhook.deletion.confirmed', { photoId });

      if (storageAccountId && fileSize !== undefined) {
        await decreaseStorageUsage(storageAccountId, fileSize);
        logger.info('webhook.deletion.storage_decreased', {
          photoId,
          storageAccountId,
          fileSize: fileSize.toString(),
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
