import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { successResponse, serverErrorResponse, errorResponse } from '@/lib/api/response';
import { requireAdminAuth } from '@/lib/auth/require-admin-auth';
import { z } from 'zod';
import { withRequestContext } from '@/lib/with-request-context';
import { logger } from '@/lib/logger';
import { enforceBodySizeLimit, BODY_LIMITS } from '@/lib/api/body-size-limit';

// Zod schemas for bulk operations
const bulkUpdateSchema = z.object({
  ids: z.array(z.string().min(1, 'ID cannot be empty'))
    .min(1, 'At least one ID required')
    .max(100, 'Maximum 100 IDs allowed per request'),
  toggleActive: z.boolean().optional(),
});

const bulkDeleteSchema = z.object({
  ids: z.array(z.string().min(1, 'ID cannot be empty'))
    .min(1, 'At least one ID required')
    .max(100, 'Maximum 100 IDs allowed per request'),
});

export const PATCH = withRequestContext(async (request: Request) => {
  try {
    const auth = await requireAdminAuth();
    if (auth instanceof NextResponse) return auth;

    const tooLarge = enforceBodySizeLimit(request, BODY_LIMITS.JSON_BATCH);
    if (tooLarge) return tooLarge;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return errorResponse('Invalid JSON body', 400);
    }
    
    // Validate request body
    const validation = bulkUpdateSchema.safeParse(body);
    if (!validation.success) {
      const firstError = validation.error.errors[0];
      return errorResponse(`${firstError.path.join('.')}: ${firstError.message}`, 400);
    }

    const { ids, toggleActive } = validation.data;

    if (toggleActive) {
      const packages = await prisma.package.findMany({
        where: { id: { in: ids } },
        select: { isActive: true },
      });

      const allActive = packages.every((p: typeof packages[number]) => p.isActive);
      const newStatus = !allActive;

      await prisma.package.updateMany({
        where: { id: { in: ids } },
        data: { isActive: newStatus },
      });
    }

    return successResponse({ updated: ids.length });
  } catch (error) {
    logger.error('admin.packages.bulk_update_failed', { err: error });
    return serverErrorResponse('Failed to update packages');
  }
});

export const DELETE = withRequestContext(async (request: Request) => {
  try {
    const auth = await requireAdminAuth();
    if (auth instanceof NextResponse) return auth;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return errorResponse('Invalid JSON body', 400);
    }
    
    // Validate request body
    const validation = bulkDeleteSchema.safeParse(body);
    if (!validation.success) {
      const firstError = validation.error.errors[0];
      return errorResponse(`${firstError.path.join('.')}: ${firstError.message}`, 400);
    }

    const { ids } = validation.data;

    await prisma.package.deleteMany({
      where: { id: { in: ids } },
    });

    return successResponse({ deleted: ids.length });
  } catch (error) {
    logger.error('admin.packages.bulk_delete_failed', { err: error });
    return serverErrorResponse('Failed to delete packages');
  }
});
