import { prisma } from '@/lib/db';
import { successResponse, serverErrorResponse } from '@/lib/api/response';
import { withRequestContext } from '@/lib/with-request-context';
import { logger } from '@/lib/logger';

export const GET = withRequestContext(async () => {
  try {
  const packages = await prisma.package.findMany({
    where: { isActive: true },
    orderBy: { createdAt: 'desc' },
  });

    return successResponse({ packages });
  } catch (error) {
    logger.error('public.booking.packages_fetch_failed', { err: error });
    return serverErrorResponse('Failed to fetch packages');
  }
});