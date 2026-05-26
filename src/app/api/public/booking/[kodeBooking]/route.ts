import { prisma } from '@/lib/db';
import { successResponse, notFoundResponse, serverErrorResponse, rateLimitResponse, getClientIp } from '@/lib/api/response';
import { withRequestContext } from '@/lib/with-request-context';
import { logger } from '@/lib/logger';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';

export const GET = withRequestContext(async (
  request: Request,
  { params }: { params: Promise<{ kodeBooking: string }> }
) => {
  try {
    const { kodeBooking } = await params;

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
    
    return successResponse(event);
  } catch (error) {
    logger.error('public.booking.fetch_failed', { err: error });
    return serverErrorResponse('Failed to fetch booking data');
  }
});
