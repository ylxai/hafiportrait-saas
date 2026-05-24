import { prisma } from '@/lib/db';
import { successResponse, errorResponse } from '@/lib/api/response';
import { NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/auth/require-admin-auth';
import { createAdminPaginationResponse } from '@/types/pagination';
import { z } from 'zod';
import { RATE_LIMITS } from '@/lib/rate-limit';
import { enforceRateLimit } from '@/lib/rate-limit-helper';

// Zod schema for query parameters
const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export async function GET(request: Request) {
  try {
    const auth = await requireAdminAuth();
    if (auth instanceof NextResponse) return auth;

    // Rate limiting
    const rateLimit = await enforceRateLimit({
      identifier: `finance:get:${auth.user.email}`,
      limit: RATE_LIMITS.ADMIN_READ
    });
    if (rateLimit) return rateLimit;

    // Parse and validate query params
    const { searchParams } = new URL(request.url);
    const validation = querySchema.safeParse({
      page: searchParams.get('page') ?? undefined,
      limit: searchParams.get('limit') ?? undefined,
    });

    if (!validation.success) {
      const firstError = validation.error.errors[0];
      return errorResponse(`${firstError.path.join('.')}: ${firstError.message}`, 400);
    }

    const { page, limit } = validation.data;
    const skip = (page - 1) * limit;

    const [events, totalAgg, paidAgg, pendingAgg, revenueByMonthRaw] = await Promise.all([
      // Paginated events list
      prisma.event.findMany({
        select: {
          id: true,
          kodeBooking: true,
          namaProject: true,
          totalPrice: true,
          paidAmount: true,
          paymentStatus: true,
          eventDate: true,
          client: { select: { nama: true } },
          package: { select: { nama: true } },
        },
        orderBy: { eventDate: 'desc' },
        take: limit,
        skip,
      }),
      // Total stats
      prisma.event.aggregate({
        _sum: { totalPrice: true },
        _count: { id: true },
      }),
      // Paid stats
      prisma.event.aggregate({
        where: { paymentStatus: 'paid' },
        _sum: { totalPrice: true },
        _count: { id: true },
      }),
      // Pending stats
      prisma.event.aggregate({
        where: { paymentStatus: { not: 'paid' } },
        _sum: { totalPrice: true },
        _count: { id: true },
      }),
      // SQL aggregation for revenue by month (much faster than JS processing)
      prisma.$queryRaw`
        SELECT 
          TO_CHAR("eventDate", 'YYYY Mon') as month,
          SUM("totalPrice") as revenue
        FROM "Event"
        WHERE "paymentStatus" = 'paid'
        GROUP BY TO_CHAR("eventDate", 'YYYY Mon'), DATE_TRUNC('month', "eventDate")
        ORDER BY DATE_TRUNC('month', "eventDate") DESC
        LIMIT 12
      ` as Promise<{ month: string; revenue: bigint }[]>,
    ]);

    // Convert revenue by month to record
    const revenueByMonth: Record<string, number> = {};
    for (const row of revenueByMonthRaw) {
      revenueByMonth[row.month] = Number(row.revenue);
    }

    const total = totalAgg._count.id;

    // BigInt-safe revenue serialization. `totalPrice` is currently a
    // Prisma `Int`, so `_sum` returns a JS `number` directly. The
    // `.toString()` conversion exists for two reasons:
    //   1. JSON serialization safety — `JSON.stringify` cannot serialize
    //      a `BigInt`, and a future schema migration to `BigInt` (for
    //      revenue beyond ~9 quadrillion IDR) would otherwise crash this
    //      route silently.
    //   2. Contract alignment — `/api/admin/stats` already emits
    //      `totalRevenue` as a string. Returning the same shape here
    //      means the admin UI's currency formatter has one code path.
    // Note: an `Int` aggregate that overflows `Number.MAX_SAFE_INTEGER`
    // would lose precision *before* the toString, so the schema-side
    // migration is the long-term fix; this is the safe-by-default
    // serialization convention until then.
    const summary = {
      totalEvents: total,
      paidEvents: paidAgg._count.id,
      pendingEvents: pendingAgg._count.id,
      totalRevenue: (totalAgg._sum.totalPrice ?? 0).toString(),
      totalPaid: (paidAgg._sum.totalPrice ?? 0).toString(),
      totalPending: (pendingAgg._sum.totalPrice ?? 0).toString(),
    };

    const eventsList = events.map((e: typeof events[number]) => ({
      id: e.id,
      kodeBooking: e.kodeBooking,
      namaProject: e.namaProject,
      client: e.client.nama,
      packageName: e.package?.nama || '-',
      totalPrice: e.totalPrice,
      paidAmount: e.paidAmount,
      paymentStatus: e.paymentStatus,
      eventDate: e.eventDate,
    }));

    return successResponse({
      summary,
      revenueByMonth,
      events: eventsList,
      pagination: createAdminPaginationResponse(page, limit, total),
    });
  } catch (error) {
    console.error('Error fetching finance:', error);
    return errorResponse('Failed to fetch finance data', 500);
  }
}