import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { successResponse, serverErrorResponse, errorResponse, notFoundResponse } from '@/lib/api/response';
import { RATE_LIMITS } from '@/lib/rate-limit';
import { enforceRateLimit } from '@/lib/rate-limit-helper';
import { packageSchema, packageUpdateSchema, idSchema, validateRequest } from '@/lib/api/validation';
import { requireAdminAuth } from '@/lib/auth/require-admin-auth';
import { parseAdminPaginationSafe, createAdminPaginationResponse } from '@/types/pagination';
import { withRequestContext } from '@/lib/with-request-context';
import { logger } from '@/lib/logger';
import { isPrismaError as isPrismaErrorShared } from '@/lib/prisma-error';
import { enforceBodySizeLimit, BODY_LIMITS } from '@/lib/api/body-size-limit';

function isPrismaError(error: unknown, code: string): boolean {
  return isPrismaErrorShared(error, code);
}

export const GET = withRequestContext(async (request: Request) => {
  try {
    const auth = await requireAdminAuth();
    if (auth instanceof NextResponse) return auth;

    // Rate limiting
    const rateLimit = await enforceRateLimit({
      identifier: `packages:get:${auth.user.email}`,
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

    const [packages, total] = await Promise.all([
      prisma.package.findMany({
        orderBy: { price: 'asc' },
        take: limit,
        skip,
      }),
      prisma.package.count(),
    ]);

    return successResponse({
      packages,
      pagination: createAdminPaginationResponse(page, limit, total),
    });
  } catch (error) {
    logger.error('admin.packages.fetch_failed', { err: error });
    return serverErrorResponse('Failed to fetch packages');
  }
});

export const POST = withRequestContext(async (request: Request) => {
  try {
    const auth = await requireAdminAuth();
    if (auth instanceof NextResponse) return auth;

    // Rate limiting
    const rateLimit = await enforceRateLimit({
      identifier: `packages:post:${auth.user.email}`,
      limit: RATE_LIMITS.ADMIN_WRITE
    });
    if (rateLimit) return rateLimit;

    const tooLarge = enforceBodySizeLimit(request, BODY_LIMITS.JSON_SMALL);
    if (tooLarge) return tooLarge;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return errorResponse('Invalid JSON body', 400);
    }
    const validation = packageSchema.safeParse(body);

    if (!validation.success) {
      const firstError = validation.error.errors[0];
      return errorResponse(
        firstError.path.length > 0
          ? `${firstError.path.join('.')}: ${firstError.message}`
          : firstError.message,
        400
      );
    }

    const pkg = await prisma.package.create({
      data: validation.data,
    });

    return successResponse({ data: pkg }, 201);
  } catch (error) {
    logger.error('admin.packages.create_failed', { err: error });
    if (isPrismaError(error, 'P2002')) {
      return errorResponse('Package name already in use', 409);
    }
    return serverErrorResponse('Failed to create package');
  }
});

export const PATCH = withRequestContext(async (request: Request) => {
  try {
    const auth = await requireAdminAuth();
    if (auth instanceof NextResponse) return auth;

    // Rate limiting
    const rateLimit = await enforceRateLimit({
      identifier: `packages:patch:${auth.user.email}`,
      limit: RATE_LIMITS.ADMIN_WRITE
    });
    if (rateLimit) return rateLimit;

    const tooLarge = enforceBodySizeLimit(request, BODY_LIMITS.JSON_SMALL);
    if (tooLarge) return tooLarge;

    const body: unknown = await request.json();
    
    // Validate ID
    const idValidation = validateRequest(idSchema, body);
    if (!idValidation.success) {
      return errorResponse(idValidation.error, 400);
    }

    const { id } = idValidation.data;

    // Validate update data
    const dataValidation = validateRequest(packageUpdateSchema, body);
    if (!dataValidation.success) {
      return errorResponse(dataValidation.error, 400);
    }

    const pkg = await prisma.package.update({
      where: { id },
      data: dataValidation.data,
    });

    return successResponse({ data: pkg });
  } catch (error) {
    logger.error('admin.packages.update_failed', { err: error });
    if (isPrismaError(error, 'P2025')) {
      return notFoundResponse('Package not found');
    }
    if (isPrismaError(error, 'P2002')) {
      return errorResponse('Package name already in use', 409);
    }
    return serverErrorResponse('Failed to update package');
  }
});

export const DELETE = withRequestContext(async (request: Request) => {
  try {
    const auth = await requireAdminAuth();
    if (auth instanceof NextResponse) return auth;

    // Rate limiting
    const rateLimit = await enforceRateLimit({
      identifier: `packages:delete:${auth.user.email}`,
      limit: RATE_LIMITS.ADMIN_WRITE
    });
    if (rateLimit) return rateLimit;

    const { searchParams } = new URL(request.url);
    
    // Validate ID
    const idValidation = validateRequest(idSchema, { id: searchParams.get('id') });
    if (!idValidation.success) {
      return errorResponse(idValidation.error, 400);
    }

    const { id } = idValidation.data;

    await prisma.package.delete({ where: { id } });

    return successResponse({ success: true });
  } catch (error) {
    logger.error('admin.packages.delete_failed', { err: error });
    if (isPrismaError(error, 'P2025')) {
      return notFoundResponse('Package not found');
    }
    return serverErrorResponse('Failed to delete package');
  }
});