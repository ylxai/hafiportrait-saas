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

    const [galleries, summary] = await Promise.all([
      prisma.gallery.findMany({
        select: {
          id: true,
          namaProject: true,
          status: true,
          viewCount: true,
          createdAt: true,
          updatedAt: true,
          event: { select: { client: { select: { nama: true } } } },
          _count: { select: { photos: true, selections: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.gallery.aggregate({
        _count: { id: true },
        _sum: { viewCount: true },
      }),
    ]);

    const publishedCount = await prisma.gallery.count({
      where: { status: 'published' },
    });

    const totalSelections = await prisma.selection.count();

    const analytics = galleries.map((g) => ({
      id: g.id,
      namaProject: g.namaProject,
      client: g.event.client.nama,
      status: g.status,
      photoCount: g._count.photos,
      viewCount: g.viewCount,
      selectionCount: g._count.selections,
      selectedPhotos: g._count.selections,
      createdAt: g.createdAt,
      publishedAt: g.status === 'published' ? g.updatedAt : null,
    }));

    const summaryResult = {
      totalGalleries: galleries.length,
      publishedGalleries: publishedCount,
      totalViews: summary._sum.viewCount || 0,
      avgViews: galleries.length > 0 ? Math.round((summary._sum.viewCount || 0) / galleries.length) : 0,
      totalSelections,
    };

    return successResponse({ analytics, summary: summaryResult });
  } catch (error) {
    console.error('Error fetching analytics:', error);
    return errorResponse('Failed to fetch analytics', 500);
  }
}