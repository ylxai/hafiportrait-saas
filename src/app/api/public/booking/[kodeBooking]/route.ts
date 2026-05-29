import { prisma } from '@/lib/db';
import { successResponse, notFoundResponse, serverErrorResponse, rateLimitResponse, getClientIp, errorResponse } from '@/lib/api/response';
import { withRequestContext } from '@/lib/with-request-context';
import { logger } from '@/lib/logger';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { kodeBookingParamsSchema, formatZodError } from '@/lib/api/validation';
import { deriveUploadToken, UPLOAD_TOKEN_TTL_MS } from '@/lib/upload-token';

export const GET = withRequestContext(async (
  request: Request,
  { params }: { params: Promise<{ kodeBooking: string }> }
) => {
  try {
    const rawParams = await params;
    const validated = kodeBookingParamsSchema.safeParse(rawParams);
    if (!validated.success) {
      return errorResponse(formatZodError(validated.error), 400);
    }
    const { kodeBooking } = validated.data;

    // Rate limit: prevent kodeBooking enumeration
    const ip = getClientIp(request);
    const rl = await checkRateLimit(`public:booking:lookup:${ip}`, RATE_LIMITS.PUBLIC_READ);
    if (!rl.success) {
      return rateLimitResponse('Too many requests', Math.ceil((rl.resetAt - Date.now()) / 1000));
    }

    const event = await prisma.event.findUnique({
      where: { kodeBooking },
      include: {
        client: {
          select: {
            // BUG FIX: strip PII — only expose nama for display purposes.
            // email, phone, instagram must NOT be returned to unauthenticated callers.
            nama: true,
          },
        },
        package: {
          select: {
            nama: true,
            description: true,
            price: true,
            fitur: true,
          },
        },
        payments: {
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            amount: true,
            method: true,
            status: true,
            type: true,
            // uniqueCode selected for computing transferAmount, but stripped
            // before returning to the client (see paymentsWithTransfer below).
            uniqueCode: true,
            proofUrl: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    });

    if (!event) {
      return notFoundResponse('Booking not found');
    }

    // Issue a short-lived HMAC upload token so new bookers (no session yet)
    // can request a presigned URL for their payment proof.
    // Derivation is handled by the shared helper in @/lib/upload-token.
    let uploadToken: string | null = null;
    let uploadTokenExpiry: number | null = null;
    uploadTokenExpiry = Date.now() + UPLOAD_TOKEN_TTL_MS;
    uploadToken = deriveUploadToken(event.id, uploadTokenExpiry);
    if (!uploadToken) {
      logger.warn('public.booking.upload_token_skipped_no_secret', { kodeBooking });
      uploadTokenExpiry = null;
    }

    const paymentsWithTransfer = event.payments.map(({ uniqueCode, ...p }: typeof event.payments[number]) => ({
      ...p,
      transferAmount: (p.amount ?? 0) + (uniqueCode ?? 0),
    }));

    return successResponse({
      ...event,
      payments: paymentsWithTransfer,
      uploadToken,
      uploadTokenExpiry,
    });
  } catch (error) {
    logger.error('public.booking.fetch_failed', { err: error });
    return serverErrorResponse('Failed to fetch booking data');
  }
});
