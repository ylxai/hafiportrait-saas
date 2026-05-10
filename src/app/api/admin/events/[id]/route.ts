import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { successResponse, serverErrorResponse, errorResponse, notFoundResponse } from '@/lib/api/response';
import { eventUpdateSchema, validateRequest } from '@/lib/api/validation';
import { safeClientSelect } from '@/lib/api/select';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';
import {
  aggregateUsedBytesByClient,
  collectPhotoDeletionPayloads,
  enqueueDeletionWithOutbox,
} from '@/lib/cloudflare-queue';
import { logger } from '@/lib/logger';

async function checkAuth() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return errorResponse('Unauthorized', 401);
  }
  return session;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await checkAuth();
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
    console.error('Error fetching event:', error);
    return serverErrorResponse('Failed to fetch event');
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await checkAuth();
    if (auth instanceof NextResponse) return auth;

    const { id } = await params;
    if (!id) {
      return errorResponse('Event ID is required', 400);
    }

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
    console.error('Error updating event:', error);
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2025') {
      return notFoundResponse('Event not found');
    }
    return serverErrorResponse('Failed to update event');
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await checkAuth();
    if (auth instanceof NextResponse) return auth;

    const { id } = await params;

    if (!id) {
      return errorResponse('Event ID is required', 400);
    }

    // Step 1 — collect storage-deletion payloads BEFORE the delete
    // commits, because the Gallery→Photo cascade will hide the rows
    // the moment the Event is gone. Review #73-2 (Gemini): the payload
    // now carries `clientId` + `fileSize`, so we derive the per-client
    // `usedStorage` decrement from the same query — no separate
    // `findMany` round-trip.
    const deletionPayloads = await collectPhotoDeletionPayloads({
      gallery: { eventId: id },
    });
    const usedByClient = aggregateUsedBytesByClient(deletionPayloads);

    // Step 2 — DB-first: commit the delete plus the quota decrement in
    // one transaction. If this fails the storage stays untouched and the
    // user retries safely.
    await prisma.$transaction([
      prisma.event.delete({ where: { id } }),
      ...Array.from(usedByClient.entries())
        .filter(([, bytes]) => bytes > BigInt(0))
        .map(([clientId, bytes]) =>
          prisma.client.update({
            where: { id: clientId },
            data: { usedStorage: { decrement: bytes } },
          }),
        ),
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
    console.error('Error deleting event:', error);
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2025') {
      return notFoundResponse('Event not found');
    }
    return serverErrorResponse('Failed to delete event');
  }
}
