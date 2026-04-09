import { prisma } from '@/lib/db';
import { successResponse, errorResponse } from '@/lib/api/response';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';

// Simple in-memory cache
const cache = new Map<string, { data: unknown; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return errorResponse('Unauthorized', 401);
    }

    // Parse pagination params
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') || '20')));
    const skip = (page - 1) * limit;

    // Check cache for summary data (page 1 only)
    const cacheKey = 'analytics:summary';
    const cached = cache.get(cacheKey);
    const isCacheValid = cached && Date.now() - cached.timestamp < CACHE_TTL;

    // Fetch galleries with pagination
    const [galleries, summary, publishedCount, totalSelections] = await Promise.all([
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
        take: limit,
        skip,
      }),
      // Use cache for summary on page 1
      page === 1 && isCacheValid
        ? Promise.resolve(cached!.data as { _count: { id: number }; _sum: { viewCount: number | null } })
        : prisma.gallery.aggregate({
            _count: { id: true },
            _sum: { viewCount: true },
          }),
      page === 1 && isCacheValid
        ? Promise.resolve((cached!.data as { publishedCount: number }).publishedCount)
        : prisma.gallery.count({ where: { status: 'published' } }),
      page === 1 && isCacheValid
        ? Promise.resolve((cached!.data as { totalSelections: number }).totalSelections)
        : prisma.selection.count(),
    ]);

    // Update cache if not using cache
    if (page === 1 && !isCacheValid) {
      cache.set(cacheKey, {
        data: { ...summary, publishedCount, totalSelections },
        timestamp: Date.now(),
      });
    }

    // Get total count for pagination
    const total = page === 1 && isCacheValid
      ? (summary as { _count: { id: number } })._count.id
      : await prisma.gallery.count();

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
      totalGalleries: total,
      publishedGalleries: publishedCount as number,
      totalViews: (summary as { _sum: { viewCount: number | null } })._sum.viewCount || 0,
      avgViews: total > 0 ? Math.round(((summary as { _sum: { viewCount: number | null } })._sum.viewCount || 0) / total) : 0,
      totalSelections: totalSelections as number,
    };

    return successResponse({
      analytics,
      summary: summaryResult,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Error fetching analytics:', error);
    return errorResponse('Failed to fetch analytics', 500);
  }
}