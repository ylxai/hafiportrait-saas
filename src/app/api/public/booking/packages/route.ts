import { prisma } from '@/lib/db';
import { successResponse, serverErrorResponse, rateLimitResponse } from '@/lib/api/response';
import { withRequestContext } from '@/lib/with-request-context';
import { logger } from '@/lib/logger';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';

export const GET = withRequestContext(async (request: Request) => {
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown';
    const rl = await checkRateLimit(`public:packages:${ip}`, RATE_LIMITS.PUBLIC_READ);
    if (!rl.success) return rateLimitResponse('Too many requests', Math.ceil((rl.resetAt - Date.now()) / 1000));

    const packages = await prisma.package.findMany({
      where: { isActive: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return successResponse({ packages });
  } catch (error) {
    logger.error('public.booking.packages_fetch_failed', { err: error });
    return serverErrorResponse('Failed to fetch packages');
  }
});
