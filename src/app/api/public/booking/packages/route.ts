import { prisma } from '@/lib/db';
import { successResponse, serverErrorResponse } from '@/lib/api/response';
import { withRequestContext } from '@/lib/with-request-context';

export const GET = withRequestContext(async () => {
  try {
  const packages = await prisma.package.findMany({
    where: { isActive: true },
    orderBy: { createdAt: 'desc' },
  });

    return successResponse({ packages });
  } catch (error) {
    console.error('Error fetching packages:', error);
    return serverErrorResponse('Failed to fetch packages');
  }
});