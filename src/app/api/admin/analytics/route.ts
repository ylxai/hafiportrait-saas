import { prisma } from '@/lib/db';
import { successResponse, errorResponse } from '@/lib/api/response';
import { NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/auth/require-admin-auth';
import { createAdminPaginationResponse } from '@/types/pagination';
import { RATE_LIMITS } from '@/lib/rate-limit';
import { enforceRateLimit } from '@/lib/rate-limit-helper';
import { getCachedData } from '@/lib/cache';
import { z } from 'zod';
import { withRequestContext } from '@/lib/with-request-context';

// Zod schema for query parameters
const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const GET = withRequestContext(async (request: Request) => {
  try {
    const auth = await requireAdminAuth();
    if (auth instanceof NextResponse) return auth;

    // Rate limiting
    const rateLimit = await enforceRateLimit({
      identifier: `analytics:get:${auth.user.email}`,
      limit: RATE_LIMITS.STATS
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

    // Fetch galleries and summary (cached) concurrently
    const [galleries, summaryData] = await Promise.all([
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
      getCachedData(
        `analytics:summary:${auth.user.email || 'admin'}`,
        async () => {
          const [summary, publishedCount, totalSelections] = await Promise.all([
            prisma.gallery.aggregate({
              _count: { id: true },
              _sum: { viewCount: true },
            }),
            prisma.gallery.count({ where: { status: 'published' } }),
            prisma.selection.count(),
          ]);
          return { summary, publishedCount, totalSelections };
        },
        300
      )
    ]);

    const total = summaryData.summary._count.id;

    const analytics = galleries.map((g: typeof galleries[number]) => ({
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
      publishedGalleries: summaryData.publishedCount,
      totalViews: (summaryData.summary._sum.viewCount || 0).toString(),
      avgViews: total > 0 ? Math.round(Number(summaryData.summary._sum.viewCount || 0) / total) : 0,
      totalSelections: summaryData.totalSelections,
    };

    return successResponse({
      analytics,
      summary: summaryResult,
      pagination: createAdminPaginationResponse(page, limit, total),
    });
  } catch (error) {
    console.error('Error fetching analytics:', error);
    return errorResponse('Failed to fetch analytics', 500);
  }
});