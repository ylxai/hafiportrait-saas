import { prisma } from '@/lib/db';
import { successResponse, errorResponse } from '@/lib/api/response';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return errorResponse('Unauthorized', 401);
    }

    // Parse pagination params
    const { searchParams } = new URL(request.url);
    const pageRaw = parseInt(searchParams.get('page') ?? '1', 10);
    const page = Number.isNaN(pageRaw) ? 1 : Math.max(1, pageRaw);
    const limitRaw = parseInt(searchParams.get('limit') ?? '20', 10);
    const limit = Number.isNaN(limitRaw) ? 20 : Math.min(100, Math.max(1, limitRaw));
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

    const summary = {
      totalEvents: total,
      paidEvents: paidAgg._count.id,
      pendingEvents: pendingAgg._count.id,
      totalRevenue: totalAgg._sum.totalPrice || 0,
      totalPaid: paidAgg._sum.totalPrice || 0,
      totalPending: pendingAgg._sum.totalPrice || 0,
    };

    const eventsList = events.map((e) => ({
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
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Error fetching finance:', error);
    return errorResponse('Failed to fetch finance data', 500);
  }
}