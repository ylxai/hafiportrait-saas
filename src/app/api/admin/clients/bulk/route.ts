import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { successResponse, serverErrorResponse, errorResponse } from '@/lib/api/response';
import { requireAdminAuth } from '@/lib/auth/require-admin-auth';
import { collectPhotoDeletionPayloads, enqueueDeletionWithOutbox } from '@/lib/cloudflare-queue';
import { logger } from '@/lib/logger';
import { z } from 'zod';

// Zod schema for bulk delete
const bulkDeleteSchema = z.object({
  ids: z.array(z.string().min(1, 'ID cannot be empty'))
    .min(1, 'At least one ID required')
    .max(100, 'Maximum 100 IDs allowed per request'),
});

export async function DELETE(request: Request) {
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

    // Step 1 — collect storage payloads BEFORE the Client→Event→
    // Gallery→Photo cascade hides them.
    const deletionPayloads = await collectPhotoDeletionPayloads({
      gallery: { event: { clientId: { in: ids } } },
    });

    // Step 2 — DB-first deleteMany; the queue is left alone if this
    // fails so the call can be retried safely.
    await prisma.client.deleteMany({
      where: { id: { in: ids } },
    });

    // Step 3 — best-effort enqueue with `FailedJob` outbox fallback.
    const outcome = await enqueueDeletionWithOutbox(deletionPayloads);
    if (outcome.outboxed > 0) {
      logger.warn('clients.bulk_delete.storage_outboxed', {
        clientCount: ids.length,
        photoCount: outcome.outboxed,
        outboxJobId: outcome.outboxJobId,
      });
    }

    return successResponse({ deleted: ids.length });
  } catch (error) {
    console.error('Error bulk deleting clients:', error);
    return serverErrorResponse('Failed to delete clients');
  }
}
