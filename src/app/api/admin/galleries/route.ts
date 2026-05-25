import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { successResponse, handlePrismaError, validationError, errorResponse } from '@/lib/api/response';
import { RATE_LIMITS } from '@/lib/rate-limit';
import { enforceRateLimit } from '@/lib/rate-limit-helper';
import { gallerySchema } from '@/lib/api/validation';
import { safeClientSelect } from '@/lib/api/select';
import { generateClientToken } from '@/lib/utils';
import { requireAdminAuth } from '@/lib/auth/require-admin-auth';
import { parseAdminPaginationSafe, createAdminPaginationResponse } from '@/types/pagination';
import { withRequestContext } from '@/lib/with-request-context';

export const GET = withRequestContext(async (request: Request) => {
  try {
    const auth = await requireAdminAuth();
    if (auth instanceof NextResponse) return auth;

    // Rate limiting
    const rateLimit = await enforceRateLimit({
      identifier: `galleries:get:${auth.user.email}`,
      limit: RATE_LIMITS.ADMIN_READ
    });
    if (rateLimit) return rateLimit;

    const { searchParams } = new URL(request.url);
    
    // Validate pagination parameters
    const paginationResult = parseAdminPaginationSafe(searchParams);
    if (!paginationResult.success) {
      const firstError = paginationResult.error.errors[0];
      return errorResponse(`${firstError.path.join('.')}: ${firstError.message}`, 400);
    }
    
    const { page, limit, skip } = paginationResult.data;

    const [galleries, total] = await Promise.all([
      prisma.gallery.findMany({
        include: {
          event: {
            include: {
              // Strip Client.password (bcrypt hash) from API response.
              client: { select: safeClientSelect },
            },
          },
          _count: {
            select: {
              photos: true,
              selections: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip,
      }),
      prisma.gallery.count(),
    ]);

    return successResponse({
      galleries,
      pagination: createAdminPaginationResponse(page, limit, total),
    });
  } catch (error) {
    console.error('[API] Error fetching galleries:', error);
    return handlePrismaError(error);
  }
});

export const POST = withRequestContext(async (request: Request) => {
  try {
    const auth = await requireAdminAuth();
    if (auth instanceof NextResponse) return auth;

    // Rate limiting
    const rateLimit = await enforceRateLimit({
      identifier: `galleries:post:${auth.user.email}`,
      limit: RATE_LIMITS.ADMIN_WRITE
    });
    if (rateLimit) return rateLimit;

    const body: unknown = await request.json();
    const result = gallerySchema.safeParse(body);
    
    if (!result.success) {
      return validationError(result.error);
    }

    const gallery = await prisma.gallery.create({
      data: {
        ...result.data,
        clientToken: generateClientToken(),
      },
    });

    return successResponse({ gallery }, 201);
  } catch (error) {
    console.error('[API] Error creating gallery:', error);
    return handlePrismaError(error);
  }
});
