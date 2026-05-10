import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { successResponse, serverErrorResponse, errorResponse } from '@/lib/api/response';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';
import {
  aggregateUsedBytesByClient,
  collectPhotoDeletionPayloads,
  enqueueDeletionWithOutbox,
} from '@/lib/cloudflare-queue';
import { logger } from '@/lib/logger';
import { z } from 'zod';

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

async function checkAuth() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return errorResponse('Unauthorized', 401);
  }
  return session;
}

export async function PATCH(request: Request) {
  try {
    const auth = await checkAuth();
    if (auth instanceof NextResponse) return auth;

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
    console.error('Error bulk updating events:', error);
    return serverErrorResponse('Failed to update events');
  }
}

export async function DELETE(request: Request) {
  try {
    const auth = await checkAuth();
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

    // Step 1 — collect storage-deletion payloads BEFORE the delete
    // commits, because the Gallery→Photo cascade will hide the rows
    // the moment the events disappear. Review #73-2 (Gemini): the
    // payload now carries `clientId` + `fileSize`, so we derive the
    // per-client `usedStorage` decrement from the same query — no
    // separate `findMany` round-trip.
    const deletionPayloads = await collectPhotoDeletionPayloads({
      gallery: { eventId: { in: ids } },
    });
    const usedByClient = aggregateUsedBytesByClient(deletionPayloads);

    // Step 2 — DB-first transaction (delete + per-client `usedStorage`
    // decrement). Storage stays untouched if this fails.
    await prisma.$transaction([
      prisma.event.deleteMany({ where: { id: { in: ids } } }),
      ...Array.from(usedByClient.entries())
        .filter(([, bytes]) => bytes > BigInt(0))
        .map(([clientId, bytes]) =>
          prisma.client.update({
            where: { id: clientId },
            data: { usedStorage: { decrement: bytes } },
          }),
        ),
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
    console.error('Error bulk deleting events:', error);
    return serverErrorResponse('Failed to delete events');
  }
}
