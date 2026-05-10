import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { successResponse, serverErrorResponse, errorResponse } from '@/lib/api/response';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';
import { collectPhotoDeletionPayloads, enqueueDeletionWithOutbox } from '@/lib/cloudflare-queue';
import { logger } from '@/lib/logger';
import { z } from 'zod';

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
    console.error('Error bulk updating galleries:', error);
    return serverErrorResponse('Failed to update galleries');
  }
}

export async function DELETE(request: Request) {
  try {
    const auth = await checkAuth();
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
    // commits; the cascade is about to remove the photo rows.
    const photoSizes = await prisma.photo.findMany({
      where: { galleryId: { in: ids } },
      select: { fileSize: true, gallery: { select: { event: { select: { clientId: true } } } } },
    });
    const usedByClient = new Map<string, bigint>();
    for (const p of photoSizes) {
      const cid = p.gallery.event.clientId;
      usedByClient.set(cid, (usedByClient.get(cid) ?? BigInt(0)) + (p.fileSize ?? BigInt(0)));
    }
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
    console.error('Error bulk deleting galleries:', error);
    return serverErrorResponse('Failed to delete galleries');
  }
}
