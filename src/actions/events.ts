'use server';

/**
 * Server Actions for the admin "Events" feature.
 *
 * This module is a proof-of-concept of migrating mutations from
 * `/api/admin/events*` REST routes to Next.js Server Actions:
 *  - The Client Component (`admin/events/page.tsx`) calls these functions
 *    directly via React, so there is no fetch/JSON.stringify boilerplate
 *    on the client and no manual NextResponse wrapping on the server.
 *  - Auth, validation, and Prisma logic stay on the server. We reuse the
 *    same Zod schemas as the REST routes so behaviour is identical.
 *  - A typed result object (`ActionResult`) replaces HTTP status codes,
 *    keeping the contract end-to-end type-safe.
 *  - `revalidatePath('/admin/events')` invalidates the App Router cache so
 *    any Server Component view of the same data updates after a mutation.
 *
 * The legacy REST endpoints stay for backwards compatibility (and for
 * non-browser callers) — actions are an additional, friendlier surface.
 */

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';
import { prisma } from '@/lib/db';
import {
  aggregateUsedBytesByClient,
  collectPhotoDeletionPayloads,
  enqueueDeletionWithOutbox,
} from '@/lib/cloudflare-queue';
import { logger } from '@/lib/logger';

// The Prisma client in this project is generated with `--no-engine`, so the
// `Prisma.*UpdateManyInput` namespace type is not always emitted. Derive the
// `data` argument shape directly from the runtime client instead — same
// safety guarantee, no dependency on the generated namespace surface.
type EventUpdateManyData = Parameters<typeof prisma.event.updateMany>[0]['data'];

export type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string };

async function requireAdmin(): Promise<ActionResult<true>> {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return { success: false, error: 'Unauthorized' };
  }
  return { success: true, data: true };
}

const idSchema = z.string().min(1, 'Event id required');

const bulkIdsSchema = z
  .array(z.string().min(1))
  .min(1, 'At least one ID required')
  .max(100, 'Maximum 100 IDs per request');

const bulkUpdateSchema = z
  .object({
    ids: bulkIdsSchema,
    status: z.enum(['pending', 'confirmed', 'completed', 'cancelled']).optional(),
    paymentStatus: z.enum(['unpaid', 'partial', 'paid', 'awaiting_confirmation']).optional(),
  })
  .refine((d) => d.status || d.paymentStatus, {
    message: 'At least one of status or paymentStatus must be provided',
  });

/**
 * Delete a single event (and queue its photos for storage cleanup).
 */
export async function deleteEvent(rawId: string): Promise<ActionResult<{ id: string }>> {
  const auth = await requireAdmin();
  if (!auth.success) return auth;

  const parsed = idSchema.safeParse(rawId);
  if (!parsed.success) {
    return { success: false, error: parsed.error.errors[0].message };
  }
  const id = parsed.data;

  try {
    // Step 1 — collect the storage-deletion payloads in a single
    // round-trip. Review #73-2 (Gemini): the payload now carries
    // `clientId` + `fileSize`, so the per-client byte totals come
    // from the same query — no second `prisma.photo.findMany` needed.
    const deletionPayloads = await collectPhotoDeletionPayloads({
      gallery: { eventId: id },
    });
    const usedByClient = aggregateUsedBytesByClient(deletionPayloads);

    // Step 2 — DB-first: drop the event and decrement the owning
    // client's `usedStorage` in one transaction.
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

    // Step 3 — best-effort enqueue. A queue failure goes to the
    // `FailedJob` outbox for admin retry; the user-facing action
    // succeeds either way.
    const outcome = await enqueueDeletionWithOutbox(deletionPayloads);
    if (outcome.outboxed > 0) {
      logger.warn('action.events.delete.storage_outboxed', {
        id,
        photoCount: outcome.outboxed,
        outboxJobId: outcome.outboxJobId,
      });
    }

    revalidatePath('/admin/events');
    return { success: true, data: { id } };
  } catch (e) {
    if (e && typeof e === 'object' && 'code' in e && e.code === 'P2025') {
      return { success: false, error: 'Event not found' };
    }
    logger.error('action.events.delete.failed', { id, err: e });
    return { success: false, error: 'Failed to delete event' };
  }
}

/**
 * Delete multiple events at once.
 */
export async function deleteEventsBulk(
  rawIds: string[]
): Promise<ActionResult<{ deleted: number }>> {
  const auth = await requireAdmin();
  if (!auth.success) return auth;

  const parsed = bulkIdsSchema.safeParse(rawIds);
  if (!parsed.success) {
    return { success: false, error: parsed.error.errors[0].message };
  }
  const ids = parsed.data;

  try {
    // Same ordering as `deleteEvent`: collect → DB transaction → enqueue.
    // Review #73-2: `aggregateUsedBytesByClient` derives the same
    // `usedByClient` map from the deletion payload, eliminating the
    // duplicate `findMany`.
    const deletionPayloads = await collectPhotoDeletionPayloads({
      gallery: { eventId: { in: ids } },
    });
    const usedByClient = aggregateUsedBytesByClient(deletionPayloads);

    // `$transaction` returns operations in order — the first one is
    // `deleteMany`, so its `.count` is at index 0.
    const txResults = await prisma.$transaction([
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
    const deleted = (txResults[0] as { count: number }).count;

    const outcome = await enqueueDeletionWithOutbox(deletionPayloads);
    if (outcome.outboxed > 0) {
      logger.warn('action.events.delete_bulk.storage_outboxed', {
        eventCount: ids.length,
        photoCount: outcome.outboxed,
        outboxJobId: outcome.outboxJobId,
      });
    }

    revalidatePath('/admin/events');
    return { success: true, data: { deleted } };
  } catch (e) {
    logger.error('action.events.delete_bulk.failed', { count: ids.length, err: e });
    return { success: false, error: 'Failed to delete events' };
  }
}

/**
 * Update status / paymentStatus on multiple events at once.
 */
export async function updateEventsBulk(input: {
  ids: string[];
  status?: 'pending' | 'confirmed' | 'completed' | 'cancelled';
  paymentStatus?: 'unpaid' | 'partial' | 'paid' | 'awaiting_confirmation';
}): Promise<ActionResult<{ updated: number }>> {
  const auth = await requireAdmin();
  if (!auth.success) return auth;

  const parsed = bulkUpdateSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.errors[0].message };
  }
  const { ids, status, paymentStatus } = parsed.data;

  try {
    // Use the Prisma `data` input type so misspelled fields / wrong values
    // surface at compile time instead of runtime — replaces the previous
    // unsafe `Record<string, string>` that erased Prisma's type guarantees.
    const data: EventUpdateManyData = {};
    if (status) data.status = status;
    if (paymentStatus) data.paymentStatus = paymentStatus;

    const result = await prisma.event.updateMany({
      where: { id: { in: ids } },
      data,
    });
    revalidatePath('/admin/events');
    return { success: true, data: { updated: result.count } };
  } catch (e) {
    logger.error('action.events.update_bulk.failed', { count: ids.length, err: e });
    return { success: false, error: 'Failed to update events' };
  }
}
