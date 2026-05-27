import { createHmac, timingSafeEqual } from 'crypto';
import { formatZodError } from '@/lib/api/validation';
import { successResponse, errorResponse, serverErrorResponse, getClientIp } from '@/lib/api/response';
import { generatePresignedUploadUrl } from '@/lib/upload/presigned';
import { prisma } from '@/lib/db';
import { z } from 'zod';
import {
  MAX_FILE_SIZE_BYTES,
  MAX_FILE_SIZE_MB,
  PRESIGNED_URL_EXPIRY_SECONDS,
  ALLOWED_MIME_TYPES,
  ALLOWED_EXTENSIONS,
} from '@/lib/upload/constants';
import { withRequestContext } from '@/lib/with-request-context';
import { logger } from '@/lib/logger';
import { enforceBodySizeLimit, BODY_LIMITS } from '@/lib/api/body-size-limit';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';
import { isClientSession } from '@/lib/auth/role-helpers';
import { enforceRateLimit } from '@/lib/rate-limit-helper';
import { RATE_LIMITS } from '@/lib/rate-limit';
import { env } from '@/lib/env.server';

// Zod validation schema for public presigned upload request.
// `kodeBooking` + `uploadToken` + `uploadTokenExpiry` are optional and only
// required when the caller is unauthenticated (new booker flow).
const PublicPresignedRequestSchema = z.object({
  filename: z.string()
    .min(1, 'Filename is required')
    .max(255, 'Filename too long')
    .refine(
      (val) => /^[a-zA-Z0-9._\-\s]+$/.test(val),
      'Filename contains invalid characters'
    ),
  contentType: z.string()
    .refine(
      (val) => ALLOWED_MIME_TYPES.includes(val),
      'Invalid content type'
    ),
  eventId: z.string().min(1, 'Invalid event ID'),
  fileSize: z.number()
    .int('File size must be integer')
    .positive('File size must be positive')
    .max(MAX_FILE_SIZE_BYTES, `File too large. Maximum ${MAX_FILE_SIZE_MB}MB`),
  // New-booker auth path
  kodeBooking: z.string().min(1).max(64).optional(),
  uploadToken: z.string().min(1).max(256).optional(),
  uploadTokenExpiry: z.number().int().positive().optional(),
});

function validateFileType(filename: string): { valid: boolean; error?: string } {
  const extension = '.' + filename.split('.').pop()?.toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(extension)) {
    return {
      valid: false,
      error: `Unsupported file format: ${extension}. Allowed formats: ${ALLOWED_EXTENSIONS.join(', ')}`,
    };
  }
  return { valid: true };
}

/**
 * Constant-time HMAC verification for the upload token.
 * Token = HMAC-SHA256(tokenKey, `${eventId}:${expiry}`)
 * where tokenKey = HMAC-SHA256(VPS_WEBHOOK_SECRET, 'upload-token-v1')
 *
 * Domain separation via the derived `tokenKey` ensures the upload-token
 * MAC and the VPS webhook MAC live in disjoint key spaces — neither can
 * be cross-used to forge the other even though they share the underlying
 * `VPS_WEBHOOK_SECRET`. Bumping the `'upload-token-v1'` tag invalidates
 * outstanding tokens without rotating the secret. Must stay byte-for-byte
 * identical to the issuer in
 * /api/public/booking/[kodeBooking]/route.ts.
 */
function verifyUploadToken(
  eventId: string,
  uploadToken: string,
  uploadTokenExpiry: number
): boolean {
  const secret = env.VPS_WEBHOOK_SECRET;
  if (!secret) return false;
  if (Date.now() > uploadTokenExpiry) return false;

  const tokenKey = createHmac('sha256', secret)
    .update('upload-token-v1')
    .digest();
  const expected = createHmac('sha256', tokenKey)
    .update(`${eventId}:${uploadTokenExpiry}`)
    .digest('hex');

  const a = Buffer.from(uploadToken, 'hex');
  const b = Buffer.from(expected, 'hex');
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export const POST = withRequestContext(async (request: Request) => {
  try {
    const tooLarge = enforceBodySizeLimit(request, BODY_LIMITS.JSON_SMALL);
    if (tooLarge) return tooLarge;

    const body: unknown = await request.json();
    const validation = PublicPresignedRequestSchema.safeParse(body);

    if (!validation.success) {
      return errorResponse(formatZodError(validation.error), 400);
    }

    const {
      filename,
      contentType,
      eventId,
      kodeBooking,
      uploadToken,
      uploadTokenExpiry,
    } = validation.data;

    const typeValidation = validateFileType(filename);
    if (!typeValidation.valid) {
      return errorResponse(typeValidation.error || 'Invalid file type', 400);
    }

    // BUG FIX: require auth — unauthenticated callers must not be able to
    // generate R2 upload URLs for arbitrary events (payment fraud vector).
    // Two valid auth paths:
    //   1. Approved client session (existing portal flow)
    //   2. Short-lived HMAC upload token bound to {eventId, expiry}
    //      issued by GET /api/public/booking/[kodeBooking] for new bookers
    //      who haven't established a portal session yet.
    const session = await getServerSession(authOptions);
    let rateLimitIdentifier: string;
    let authMode: 'session' | 'token';

    if (isClientSession(session)) {
      authMode = 'session';
      rateLimitIdentifier = `payment-presigned:client:${session.user.id}`;
    } else {
      // Token-based auth path
      if (!kodeBooking || !uploadToken || uploadTokenExpiry === undefined) {
        return errorResponse('Unauthorized', 401);
      }

      if (!verifyUploadToken(eventId, uploadToken, uploadTokenExpiry)) {
        return errorResponse('Invalid or expired upload token', 401);
      }

      authMode = 'token';
      // Rate limit per IP for token flow (no user id available yet).
      rateLimitIdentifier = `payment-presigned:token:${getClientIp(request)}`;
    }

    const rateLimit = await enforceRateLimit({
      identifier: rateLimitIdentifier,
      limit: RATE_LIMITS.PAYMENT_PRESIGNED_CLIENT,
    });
    if (rateLimit) return rateLimit;

    // Look up the event with the fields needed for ownership / status checks.
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: {
        id: true,
        clientId: true,
        kodeBooking: true,
        paymentStatus: true,
        payments: {
          where: { status: 'pending', proofUrl: null },
          select: { id: true },
          take: 1,
        },
      },
    });

    if (!event) {
      return errorResponse('Event not found', 404);
    }

    if (authMode === 'session') {
      // BUG FIX: verify the event belongs to the authenticated client.
      // Without this check any logged-in client could upload a fake payment
      // proof for another client's event.
      if (event.clientId !== session!.user.id) {
        return errorResponse('Event not found', 404);
      }
    } else {
      // Token mode: bind kodeBooking to event so a token issued for one
      // booking cannot be used to upload for a different one.
      if (event.kodeBooking !== kodeBooking) {
        return errorResponse('Invalid or expired upload token', 401);
      }
    }

    if (event.paymentStatus === 'paid') {
      return errorResponse('Payment already settled', 400);
    }

    if (event.payments.length === 0) {
      return errorResponse('No active payment to upload for', 400);
    }

    // Storage path: dedicated `payments/${eventId}` prefix keeps payment
    // proofs isolated from gallery uploads and matches the verifier in
    // /api/public/payment which checks galleryId === `payments/${eventId}`.
    const virtualGalleryId = `payments/${eventId}`;

    const { presignedUrl, publicUrl, r2Key, uploadId, r2AccountId } = await generatePresignedUploadUrl(
      filename,
      contentType,
      virtualGalleryId
    );

    return successResponse({
      presignedUrl,
      publicUrl,
      r2Key,
      uploadId,
      r2AccountId,
      expiresIn: PRESIGNED_URL_EXPIRY_SECONDS,
    });
  } catch (error) {
    logger.error('public.payment.presigned_url_failed', { err: error });
    return serverErrorResponse('Failed to generate upload URL');
  }
});
