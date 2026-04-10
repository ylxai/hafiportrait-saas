import { prisma } from '@/lib/db';
import { successResponse, errorResponse, serverErrorResponse } from '@/lib/api/response';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return errorResponse('Unauthorized', 401);
    }

    const [
      totalEvents,
      totalClients,
      totalGalleries,
      totalPhotos,
      recentEvents,
      recentGalleries,
    ] = await Promise.all([
      prisma.event.count(),
      prisma.client.count(),
      prisma.gallery.count(),
      prisma.photo.count(),
      prisma.event.findMany({
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: { client: true },
      }),
      prisma.gallery.findMany({
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: { 
          event: { select: { client: { select: { nama: true } } } },
          _count: { select: { photos: true } },
        },
      }),
    ]);

    const revenueResult = await prisma.event.aggregate({
      _sum: { totalPrice: true },
      where: { paymentStatus: 'paid' },
    });

    const stats = {
      totalEvents,
      totalClients,
      totalGalleries,
      totalPhotos,
      totalRevenue: revenueResult._sum.totalPrice?.toString() ?? "0",
      recentEvents: recentEvents.map(e => ({
        id: e.id,
        namaProject: e.namaProject,
        kodeBooking: e.kodeBooking,
        eventDate: e.eventDate,
        status: e.status,
        client: e.client.nama,
      })),
      recentGalleries: recentGalleries.map(g => ({
        id: g.id,
        namaProject: g.namaProject,
        status: g.status,
        photoCount: g._count.photos,
        client: g.event.client.nama,
      })),
    };

    return successResponse(stats);
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    return serverErrorResponse('Failed to fetch stats');
  }
}