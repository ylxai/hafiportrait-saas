import { prisma } from '@/lib/db';
import { successResponse, serverErrorResponse, rateLimitResponse, getClientIp } from '@/lib/api/response';
import { withRequestContext } from '@/lib/with-request-context';
import { logger } from '@/lib/logger';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { MAX_PACKAGES_PER_PAGE } from '@/lib/api/constants';

export const GET = withRequestContext(async (request: Request) => {
  try {
    const ip = getClientIp(request);
    const rl = await checkRateLimit(`public:packages:${ip}`, RATE_LIMITS.PUBLIC_READ);
    if (!rl.success) return rateLimitResponse('Too many requests', Math.ceil((rl.resetAt - Date.now()) / 1000));

    const packages = await prisma.package.findMany({
      where: { isActive: true },
      orderBy: { createdAt: 'desc' },
      take: MAX_PACKAGES_PER_PAGE,
    });

    return successResponse({ packages });
  } catch (error) {
    logger.error('public.booking.packages_fetch_failed', { err: error });
    return serverErrorResponse('Failed to fetch packages');
  }
});
