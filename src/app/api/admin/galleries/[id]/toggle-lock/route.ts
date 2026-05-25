import { prisma } from '@/lib/db';
import { successResponse, notFoundResponse, serverErrorResponse, errorResponse } from '@/lib/api/response';
import { requireAdminAuth } from '@/lib/auth/require-admin-auth';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { validateRequest } from '@/lib/api/validation';
import { withRequestContext } from '@/lib/with-request-context';
import { logger } from '@/lib/logger';
import { enforceBodySizeLimit, BODY_LIMITS } from '@/lib/api/body-size-limit';

const toggleLockSchema = z.object({
  isSelectionLocked: z.boolean({
    required_error: 'Selection lock status is required',
    invalid_type_error: 'Selection lock status must be a boolean',
  }),
});

export const PATCH = withRequestContext(async (
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) => {
  try {
    const auth = await requireAdminAuth();
    if (auth instanceof NextResponse) return auth;

    const tooLarge = enforceBodySizeLimit(request, BODY_LIMITS.JSON_SMALL);
    if (tooLarge) return tooLarge;

    const { id } = await params;
    const body: unknown = await request.json();
    
    // Validate payload
    const validation = validateRequest(toggleLockSchema, body);
    if (!validation.success) {
      return errorResponse(validation.error, 400);
    }

    const { isSelectionLocked } = validation.data;

    const gallery = await prisma.gallery.findUnique({
      where: { id },
    });

    if (!gallery) {
      return notFoundResponse('Gallery not found');
    }

    const updatedGallery = await prisma.gallery.update({
      where: { id },
      data: { isSelectionLocked },
    });

    return successResponse({
      gallery: updatedGallery,
    });
  } catch (error) {
    logger.error('admin.gallery.toggle_lock_failed', { err: error });
    return serverErrorResponse('Failed to toggle lock');
  }
});
