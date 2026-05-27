import { createHmac } from 'crypto';
import { prisma } from '@/lib/db';
import { successResponse, notFoundResponse, serverErrorResponse, rateLimitResponse, getClientIp, errorResponse } from '@/lib/api/response';
import { withRequestContext } from '@/lib/with-request-context';
import { logger } from '@/lib/logger';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { kodeBookingParamsSchema, formatZodError } from '@/lib/api/validation';
import { env } from '@/lib/env.server';

// Upload token validity for new-booker payment proof uploads.
// Long enough to cover the booker checking email, returning later, and
// uploading transfer proof; short enough to limit replay risk if leaked.
const UPLOAD_TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

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
            // BUG FIX: uniqueCode must NOT be exposed — it is used to verify
            // real transfers and leaking it enables payment fraud.
            // proofUrl also excluded — internal admin field.
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    });

    if (!event) {
      return notFoundResponse('Booking not found');
    }

    // BUG FIX (Bug 2): issue a short-lived HMAC upload token so new bookers
    // — who don't have an authenticated client session yet — can still
    // request a presigned URL for their payment proof. The token binds
    // {event.id, expiry} so it cannot be replayed against another event.
    let uploadToken: string | null = null;
    let uploadTokenExpiry: number | null = null;
    if (env.VPS_WEBHOOK_SECRET) {
      uploadTokenExpiry = Date.now() + UPLOAD_TOKEN_TTL_MS;
      uploadToken = createHmac('sha256', env.VPS_WEBHOOK_SECRET)
        .update(`${event.id}:${uploadTokenExpiry}`)
        .digest('hex');
    } else {
      logger.warn('public.booking.upload_token_skipped_no_secret', { kodeBooking });
    }

    return successResponse({
      ...event,
      uploadToken,
      uploadTokenExpiry,
    });
  } catch (error) {
    logger.error('public.booking.fetch_failed', { err: error });
    return serverErrorResponse('Failed to fetch booking data');
  }
});
