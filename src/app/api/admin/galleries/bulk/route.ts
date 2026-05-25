import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { successResponse, serverErrorResponse, errorResponse } from '@/lib/api/response';
import { requireAdminAuth } from '@/lib/auth/require-admin-auth';
import {
  collectPhotoDeletionPayloads,
  computeUsedStorageDeltaForDeletion,
  enqueueDeletionWithOutbox,
} from '@/lib/cloudflare-queue';
import { logger } from '@/lib/logger';
import { z } from 'zod';
import { withRequestContext } from '@/lib/with-request-context';

// Zod schemas for bulk operations
const bulkUpdateSchema = z.object({
  ids: z.array(z.string().min(1, 'ID cannot be empty'))
    .min(1, 'At least one ID required')
    .max(100, 'Maximum 100 IDs allowed per request'),
  status: z.enum(['draft', 'published', 'archived']).optional(),
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

    const body: unknown = await request.json();
    
    // Validate request body
    const validation = bulkUpdateSchema.safeParse(body);
    if (!validation.success) {
      const firstError = validation.error.errors[0];
      return errorResponse(`${firstError.path.join('.')}: ${firstError.message}`, 400);
    }

    const { ids, status } = validation.data;

    const updateData: Record<string, string> = {};
    if (status) updateData.status = status;

    await prisma.gallery.updateMany({
      where: { id: { in: ids } },
      data: updateData,
    });

    return successResponse({ updated: ids.length });
  } catch (error) {
    logger.error('admin.galleries.bulk_update_failed', { err: error });
    return serverErrorResponse('Failed to update galleries');
  }
});

export const DELETE = withRequestContext(async (request: Request) => {
  try {
    const auth = await requireAdminAuth();
    if (auth instanceof NextResponse) return auth;

    const body: unknown = await request.json();
    
    // Validate request body
    const validation = bulkDeleteSchema.safeParse(body);
    if (!validation.success) {
      const firstError = validation.error.errors[0];
      return errorResponse(`${firstError.path.join('.')}: ${firstError.message}`, 400);
    }

    const { ids } = validation.data;

    // Step 1 — collect quotas + storage payloads BEFORE the delete
    // commits; the cascade is about to remove the photo rows. PR #75:
    // the byte delta only counts photos whose r2Key becomes orphan
    // (cross-gallery deduped files keep at least one live reference).
    const usedByClient = await computeUsedStorageDeltaForDeletion({
      galleryId: { in: ids },
    });
    const deletionPayloads = await collectPhotoDeletionPayloads({
      galleryId: { in: ids },
    });

    // Step 2 — DB-first transaction.
    await prisma.$transaction([
      prisma.gallery.deleteMany({ where: { id: { in: ids } } }),
      ...Array.from(usedByClient.entries())
        .filter(([, bytes]) => bytes > BigInt(0))
        .map(([clientId, bytes]) =>
          prisma.client.update({
            where: { id: clientId },
            data: { usedStorage: { decrement: bytes } },
          }),
        ),
    ]);

    // Step 3 — best-effort enqueue with outbox fallback.
    const outcome = await enqueueDeletionWithOutbox(deletionPayloads);
    if (outcome.outboxed > 0) {
      logger.warn('galleries.bulk_delete.storage_outboxed', {
        galleryCount: ids.length,
        photoCount: outcome.outboxed,
        outboxJobId: outcome.outboxJobId,
      });
    }

    return successResponse({ deleted: ids.length });
  } catch (error) {
    logger.error('admin.galleries.bulk_delete_failed', { err: error });
    return serverErrorResponse('Failed to delete galleries');
  }
});
