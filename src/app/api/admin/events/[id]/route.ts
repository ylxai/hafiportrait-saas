import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { successResponse, serverErrorResponse, errorResponse, notFoundResponse } from '@/lib/api/response';
import { eventUpdateSchema, validateRequest } from '@/lib/api/validation';
import { safeClientSelect } from '@/lib/api/select';
import { requireAdminAuth } from '@/lib/auth/require-admin-auth';
import {
  collectDeletionDataForTransaction,
  enqueueDeletionWithOutbox,
} from '@/lib/cloudflare-queue';
import { logger } from '@/lib/logger';
import { isPrismaError } from '@/lib/prisma-error';
import { withRequestContext } from '@/lib/with-request-context';
import { enforceBodySizeLimit, BODY_LIMITS } from '@/lib/api/body-size-limit';

export const GET = withRequestContext(async (
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) => {
  try {
    const auth = await requireAdminAuth();
    if (auth instanceof NextResponse) return auth;

    const { id } = await params;
    if (!id) {
      return errorResponse('Event ID is required', 400);
    }

    const event = await prisma.event.findUnique({
      where: { id },
      include: {
        // Use the explicit safe column list so we never leak
        // `Client.password` (bcrypt hash) to the admin UI. See
        // `src/lib/api/select.ts`.
        client: { select: safeClientSelect },
        package: true,
        galleries: {
          select: {
            id: true,
            namaProject: true,
            clientToken: true,
            status: true,
            viewCount: true,
            createdAt: true,
          },
        },
        payments: {
          select: {
            id: true,
            amount: true,
            type: true,
            method: true,
            status: true,
            proofUrl: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!event) {
      return notFoundResponse('Event not found');
    }

    return successResponse({ event });
  } catch (error) {
    logger.error('admin.event.fetch_failed', { err: error });
    return serverErrorResponse('Failed to fetch event');
  }
});

export const PATCH = withRequestContext(async (
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) => {
  try {
    const auth = await requireAdminAuth();
    if (auth instanceof NextResponse) return auth;

    const { id } = await params;
    if (!id) {
      return errorResponse('Event ID is required', 400);
    }

    const tooLarge = enforceBodySizeLimit(request, BODY_LIMITS.JSON_SMALL);
    if (tooLarge) return tooLarge;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return errorResponse('Invalid JSON body', 400);
    }

    const dataValidation = validateRequest(eventUpdateSchema, body);
    if (!dataValidation.success) {
      return errorResponse(dataValidation.error, 400);
    }

    const event = await prisma.event.update({
      where: { id },
      data: dataValidation.data,
      include: { client: { select: safeClientSelect }, package: true },
    });

    return successResponse({ event });
  } catch (error) {
    logger.error('admin.event.update_failed', { err: error });
    if (isPrismaError(error, 'P2025')) {
      return notFoundResponse('Event not found');
    }
    return serverErrorResponse('Failed to update event');
  }
});

export const DELETE = withRequestContext(async (
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) => {
  try {
    const auth = await requireAdminAuth();
    if (auth instanceof NextResponse) return auth;

    const { id } = await params;

    if (!id) {
      return errorResponse('Event ID is required', 400);
    }

    // Step 1 — collect dedup-aware byte deltas and storage-deletion
    // payloads BEFORE the delete commits, because the Gallery→Photo
    // cascade will hide the rows the moment the Event is gone.
    // Review #96 (Gemini): use combined helper to eliminate redundant
    // database queries.
    const { usedByClient, photoCountByClient, payloads: deletionPayloads } =
      await collectDeletionDataForTransaction({
        gallery: { eventId: id },
      });

    // Step 2 — DB-first: commit the delete plus the quota decrement in
    // one transaction. If this fails the storage stays untouched and the
    // user retries safely.
    // Collect all unique client IDs from both maps
    const allClientIds = new Set([
      ...usedByClient.keys(),
      ...photoCountByClient.keys(),
    ]);

    await prisma.$transaction([
      prisma.event.delete({ where: { id } }),
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

    // Step 3 — best-effort enqueue of the storage cleanup. A queue
    // failure becomes a `FailedJob` row (status `pending`) for admin
    // retry, NOT an HTTP 500 — the user already saw the event disappear
    // and any orphan in R2/Cloudinary is recoverable.
    const outcome = await enqueueDeletionWithOutbox(deletionPayloads);
    if (outcome.outboxed > 0) {
      logger.warn('event.delete.storage_outboxed', {
        eventId: id,
        photoCount: outcome.outboxed,
        outboxJobId: outcome.outboxJobId,
      });
    }

    return successResponse({ success: true });
  } catch (error) {
    logger.error('admin.event.delete_failed', { err: error });
    if (isPrismaError(error, 'P2025')) {
      return notFoundResponse('Event not found');
    }
    return serverErrorResponse('Failed to delete event');
  }
});
