import { NextResponse } from 'next/server';
import { requireClientAuth } from '@/lib/auth/require-client-auth';
import { prisma } from '@/lib/db';
import { successResponse, serverErrorResponse, errorResponse } from '@/lib/api/response';
import { paginationSchema, formatZodError } from '@/lib/api/validation';
import { withRequestContext } from '@/lib/with-request-context';
import { logger } from '@/lib/logger';

const GALLERIES_PER_PAGE = 10;
const RECENT_PAYMENTS_LIMIT = 5;

export const GET = withRequestContext(async (request: Request) => {
  try {
    const auth = await requireClientAuth();
    if (auth instanceof NextResponse) return auth;

    const { searchParams } = new URL(request.url);
    const paginationResult = paginationSchema.safeParse({
      page: searchParams.get('page') || undefined,
      limit: searchParams.get('limit') || String(GALLERIES_PER_PAGE),
    });
    if (!paginationResult.success) {
      return errorResponse(formatZodError(paginationResult.error), 400);
    }
    const { page, limit } = paginationResult.data;
    const skip = (page - 1) * limit;

    const [galleries, totalGalleries, payments] = await Promise.all([
      prisma.gallery.findMany({
        where: { event: { clientId: auth.user.id } },
        include: {
          event: {
            select: { namaProject: true, eventDate: true }
          },
          _count: {
            select: { photos: true, selections: true }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.gallery.count({
        where: { event: { clientId: auth.user.id } },
      }),
      prisma.payment.findMany({
        where: { event: { clientId: auth.user.id } },
        include: {
          event: {
            select: { namaProject: true, eventDate: true }
          }
        },
        orderBy: { createdAt: 'desc' },
        take: RECENT_PAYMENTS_LIMIT,
      }),
    ]);

    return successResponse({
      galleries,
      payments,
      pagination: {
        page,
        limit,
        total: totalGalleries,
        totalPages: Math.ceil(totalGalleries / limit),
        hasNextPage: page * limit < totalGalleries,
        hasPrevPage: page > 1,
      },
    });
  } catch (error) {
    logger.error('portal.dashboard.get_failed', { err: error });
    return serverErrorResponse('Failed to fetch dashboard data');
  }
});
