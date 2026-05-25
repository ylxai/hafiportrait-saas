import { NextResponse } from 'next/server';
import { requireClientAuth } from '@/lib/auth/require-client-auth';
import { prisma } from '@/lib/db';
import { successResponse, serverErrorResponse } from '@/lib/api/response';
import { withRequestContext } from '@/lib/with-request-context';
import { logger } from '@/lib/logger';

const INVOICES_PER_PAGE = 20;

export const GET = withRequestContext(async (request: Request) => {
  try {
    const auth = await requireClientAuth();
    if (auth instanceof NextResponse) return auth;

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
    const limit = Math.min(100, parseInt(searchParams.get('limit') ?? String(INVOICES_PER_PAGE), 10));
    const skip = (page - 1) * limit;

    const [payments, total] = await Promise.all([
      prisma.payment.findMany({
        where: { event: { clientId: auth.user.id } },
        include: {
          event: {
            select: { namaProject: true, eventDate: true }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.payment.count({
        where: { event: { clientId: auth.user.id } },
      }),
    ]);

    return successResponse({
      payments,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNextPage: page * limit < total,
        hasPrevPage: page > 1,
      },
    });
  } catch (error) {
    logger.error('portal.invoices.get_failed', { err: error });
    return serverErrorResponse('Failed to fetch invoices');
  }
});
