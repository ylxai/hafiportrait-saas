import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { successResponse, handlePrismaError, validationError, errorResponse } from '@/lib/api/response';
import { requireAdminAuth } from '@/lib/auth/require-admin-auth';
import { z } from 'zod';
import { collectDeletionDataForTransaction, enqueueDeletionWithOutbox } from '@/lib/cloudflare-queue';
import { RATE_LIMITS } from '@/lib/rate-limit';
import { enforceRateLimit } from '@/lib/rate-limit-helper';
import { Prisma } from '@/generated/prisma';
import { logger } from '@/lib/logger';
import { enforceBodySizeLimit, BODY_LIMITS } from '@/lib/api/body-size-limit';

const bulkDeleteSchema = z.object({
  photoIds: z.array(z.string()).min(1).max(100),
});

/**
 * Bulk delete photos with collect-then-delete-then-enqueue pattern.
 *
 * Flow (canonical, per docs/audit-tasks.md Task 1.1):
 * 1. Collect deletion payloads + storage deltas (before DB delete)
 * 2. Run atomic DB transaction (deleteMany + decrement usedStorage/photoCount)
 * 3. Enqueue storage deletion jobs (with outbox fallback on failure)
 *
 * This prevents ghost photos: if DB transaction fails, no storage jobs are queued.
 * If enqueue fails after DB commit, outbox records the failure for admin retry.
 */
export async function POST(request: Request) {
  try {
    const auth = await requireAdminAuth();
    if (auth instanceof NextResponse) return auth;

    // Reject oversized payloads before reading the body (Sprint 2 Task 2.3).
    // Bulk delete accepts a list of IDs — 5 MB covers thousands of UUIDs.
    const tooLarge = enforceBodySizeLimit(request, BODY_LIMITS.JSON_BATCH);
    if (tooLarge) return tooLarge;

    // Rate limiting
    const rateLimit = await enforceRateLimit({ identifier: `bulk-delete:post:${auth.user.email}`, limit: RATE_LIMITS.BULK_DELETE });
    if (rateLimit) return rateLimit;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return errorResponse('Invalid JSON body', 400);
    }
    const result = bulkDeleteSchema.safeParse(body);

    if (!result.success) {
      return validationError(result.error);
    }

    const { photoIds } = result.data;

    // Step 1: Collect deletion payloads and storage deltas BEFORE deleting
    const { usedByClient, photoCountByClient, payloads } =
      await collectDeletionDataForTransaction({ id: { in: photoIds } });

    if (payloads.length === 0) {
      return errorResponse('No photos found', 404);
    }

    // Step 2: Atomic DB transaction — delete photos + decrement client counters
    const deletedPhotoIds = payloads.map((p) => p.photoId);
    await prisma.$transaction(async (tx) => {
      await tx.photo.deleteMany({ where: { id: { in: deletedPhotoIds } } });

      for (const [cId, count] of photoCountByClient) {
        const storageBytes = usedByClient.get(cId) ?? BigInt(0);
        try {
          await tx.client.update({
            where: { id: cId },
            data: {
              usedStorage: { decrement: storageBytes },
              photoCount: { decrement: count },
            },
          });
        } catch (error) {
          // Handle 'record not found' gracefully (client already deleted)
          if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
            continue;
          }
          throw error;
        }
      }
    });

    logger.info('[API] bulk-delete.db_committed', {
      photoCount: payloads.length,
      photoIds: deletedPhotoIds,
    });

    // Step 3: Enqueue storage deletion AFTER DB commit (outbox fallback)
    const { queued, outboxed, outboxJobId } = await enqueueDeletionWithOutbox(payloads);

    if (outboxed > 0) {
      logger.warn('[API] bulk-delete.queue_failed_outboxed', {
        outboxed,
        outboxJobId,
        photoIds: deletedPhotoIds,
      });
    } else {
      logger.info('[API] bulk-delete.queued', { queued });
    }

    return successResponse({
      deleted: payloads.length,
      photoIds: payloads.map((p) => p.photoId),
      queuedForStorageDeletion: queued,
      outboxed,
      ...(outboxJobId ? { outboxJobId } : {}),
    });
  } catch (error) {
    logger.error('[API] bulk-delete.unhandled_error', { err: error });
    return handlePrismaError(error);
  }
}
