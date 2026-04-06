import { prisma } from '@/lib/db';
import { successResponse, errorResponse } from '@/lib/api/response';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return errorResponse('Unauthorized', 401);
    }

    const [events, totalAgg, paidAgg] = await Promise.all([
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
        take: 100,
      }),
      prisma.event.aggregate({
        _sum: { totalPrice: true },
        _count: { id: true },
      }),
      prisma.event.aggregate({
        where: { paymentStatus: 'PAID' },
        _sum: { totalPrice: true },
        _count: { id: true },
      }),
    ]);

    const pendingAgg = await prisma.event.aggregate({
      where: { paymentStatus: { not: 'PAID' } },
      _sum: { totalPrice: true },
      _count: { id: true },
    });

    const revenueByMonth: Record<string, number> = {};
    
    for (const e of events) {
      if (e.paymentStatus === 'PAID') {
        const month = new Date(e.eventDate).toLocaleString('id-ID', { year: 'numeric', month: 'short' });
        revenueByMonth[month] = (revenueByMonth[month] || 0) + e.totalPrice;
      }
    }

    const summary = {
      totalEvents: totalAgg._count.id,
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

    return successResponse({ summary, revenueByMonth, events: eventsList });
  } catch (error) {
    console.error('Error fetching finance:', error);
    return errorResponse('Failed to fetch finance data', 500);
  }
}