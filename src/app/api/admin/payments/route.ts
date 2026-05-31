import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { successResponse, serverErrorResponse, errorResponse } from '@/lib/api/response';
import { requireAdminAuth } from '@/lib/auth/require-admin-auth';
import { withRequestContext } from '@/lib/with-request-context';
import { logger } from '@/lib/logger';
import { parseAdminPaginationSafe, createAdminPaginationResponse } from '@/types/pagination';
import { formatZodError } from '@/lib/api/validation';
import { z } from 'zod';

const querySchema = z.object({
  status: z.enum(['all', 'pending', 'approved', 'rejected']).default('pending'),
});

export const GET = withRequestContext(async (request: Request) => {
  try {
    const auth = await requireAdminAuth();
    if (auth instanceof NextResponse) return auth;

    const { searchParams } = new URL(request.url);

    const queryParsed = querySchema.safeParse({
      status: searchParams.get('status') ?? 'pending',
    });
    if (!queryParsed.success) {
      return errorResponse(formatZodError(queryParsed.error), 400);
    }
    const { status } = queryParsed.data;

    const paginationResult = parseAdminPaginationSafe(searchParams);
    if (!paginationResult.success) {
      return errorResponse(formatZodError(paginationResult.error), 400);
    }
    const { page, limit, skip } = paginationResult.data;

    const where = status === 'all' ? {} : { status };

    const [payments, total] = await Promise.all([
      prisma.payment.findMany({
        where,
        include: {
          event: {
            select: {
              id: true,
              kodeBooking: true,
              namaProject: true,
              paymentStatus: true,
              client: { select: { nama: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip,
      }),
      prisma.payment.count({ where }),
    ]);

    return successResponse({
      payments,
      ...createAdminPaginationResponse(page, limit, total),
    });
  } catch (error) {
    logger.error('admin.payments.list_failed', { err: error });
    return serverErrorResponse('Failed to fetch payments');
  }
});
