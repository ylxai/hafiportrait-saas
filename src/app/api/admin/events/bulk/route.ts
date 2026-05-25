import { formatZodError } from '@/lib/api/validation';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { successResponse, serverErrorResponse, errorResponse } from '@/lib/api/response';
import { requireAdminAuth } from '@/lib/auth/require-admin-auth';
import {
  collectDeletionDataForTransaction,
  enqueueDeletionWithOutbox,
} from '@/lib/cloudflare-queue';
import { logger } from '@/lib/logger';
import { z } from 'zod';
import { withRequestContext } from '@/lib/with-request-context';
import { enforceBodySizeLimit, BODY_LIMITS } from '@/lib/api/body-size-limit';

// Zod schemas for bulk operations
const bulkUpdateSchema = z.object({
  ids: z.array(z.string().min(1, 'ID cannot be empty'))
    .min(1, 'At least one ID required')
    .max(100, 'Maximum 100 IDs allowed per request'),
  status: z.enum(['pending', 'confirmed', 'completed', 'cancelled']).optional(),
  paymentStatus: z.enum(['unpaid', 'partial', 'paid', 'awaiting_confirmation']).optional(),
}).refine(data => data.status || data.paymentStatus, {
  message: 'At least one field (status or paymentStatus) must be provided',
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
      return errorResponse(formatZodError(validation.error), 400);
    }

    const { ids, status, paymentStatus } = validation.data;

    const updateData: Record<string, string> = {};
    if (status) updateData.status = status;
    if (paymentStatus) updateData.paymentStatus = paymentStatus;

    await prisma.event.updateMany({
      where: { id: { in: ids } },
      data: updateData,
    });

    return successResponse({ updated: ids.length });
  } catch (error) {
    logger.error('admin.events.bulk_update_failed', { err: error });
    return serverErrorResponse('Failed to update events');
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
      return errorResponse(formatZodError(validation.error), 400);
    }

    const { ids } = validation.data;

    // Step 1 — collect dedup-aware byte deltas and storage-deletion
    // payloads BEFORE the delete commits, because the Gallery→Photo
    // cascade will hide the rows the moment the events disappear.
    // Review #96 (Gemini): use combined helper to eliminate redundant
    // database queries.
    const { usedByClient, photoCountByClient, payloads: deletionPayloads } =
      await collectDeletionDataForTransaction({
        gallery: { eventId: { in: ids } },
      });

    // Step 2 — DB-first transaction (delete + per-client `usedStorage`
    // decrement). Storage stays untouched if this fails.
    // Collect all unique client IDs from both maps
    const allClientIds = new Set([
      ...usedByClient.keys(),
      ...photoCountByClient.keys(),
    ]);

    await prisma.$transaction([
      prisma.event.deleteMany({ where: { id: { in: ids } } }),
      ...Array.from(allClientIds).map((clientId) => {
        const bytes = usedByClient.get(clientId) ?? BigInt(0);
        const count = photoCountByClient.get(clientId) ?? 0;
        return prisma.client.update({
          where: { id: clientId },
          data: {
            usedStorage: bytes > BigInt(0) ? { decrement: bytes } : undefined,
            photoCount: count > 0 ? { decrement: count } : undefined,
          },
        });
      }),
    ]);

    // Step 3 — best-effort enqueue. A queue failure is captured into the
    // `FailedJob` outbox; the user-facing response stays `200`.
    const outcome = await enqueueDeletionWithOutbox(deletionPayloads);
    if (outcome.outboxed > 0) {
      logger.warn('events.bulk_delete.storage_outboxed', {
        eventCount: ids.length,
        photoCount: outcome.outboxed,
        outboxJobId: outcome.outboxJobId,
      });
    }

    return successResponse({ deleted: ids.length });
  } catch (error) {
    logger.error('admin.events.bulk_delete_failed', { err: error });
    return serverErrorResponse('Failed to delete events');
  }
});
