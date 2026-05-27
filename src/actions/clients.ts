'use server';

/**
 * Server Actions for the admin "Clients" feature.
 *
 * Mirrors the proof-of-concept established in `src/actions/events.ts` so the
 * admin UI can call typed Server Actions instead of `fetch('/api/admin/...')`.
 *
 * Why migrate clients & packages too? After PR #67 introduced the events
 * actions, admin/clients/page.tsx and admin/packages/page.tsx were the
 * remaining mutation surfaces still going through REST routes. Moving them
 * here:
 *  - Lets every action share `requireAdmin`, `revalidatePath`, and the
 *    structured `ActionResult<T>` contract.
 *  - Removes the `JSON.stringify` / `await res.json()` round-trip and the
 *    associated optimistic-vs-fetch result reconciliation in the page.
 *  - Keeps Zod validation + Prisma calls server-only — passwords never leave
 *    the server boundary as plaintext, and `safeClientSelect` (PR #70) is
 *    enforced everywhere.
 *
 * The legacy REST endpoints stay live for non-browser callers (cron jobs,
 * Postman, future external integrations); they call into the same Prisma
 * primitives so behaviour is interchangeable.
 */

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { hash } from 'bcryptjs';
import { prisma } from '@/lib/db';
import { clientSchema, clientUpdateSchema } from '@/lib/api/validation';
import { collectPhotoDeletionPayloads, enqueueDeletionWithOutbox } from '@/lib/cloudflare-queue';
import { logger } from '@/lib/logger';
// Review #74-1: shared auth gate (admin-only, role-checked) lives in
// `src/lib/actions/auth.ts` so every Server Action gets the same
// defense-in-depth check rather than the role-blind copy-pasted helper.
import { requireAdmin, type ActionResult } from '@/lib/actions/auth';

// bcrypt cost factor — kept identical to `lib/auth/options.ts` and
// `clients/route.ts` so any hash produced here verifies elsewhere.
const BCRYPT_ROUNDS = 10;

// Subset of `Client` columns that are safe to surface to the admin UI.
// Mirrors `safeClientSelect` (PR #70) plus `isApproved` + `usedStorage`
// which the admin page reads. `password` is *never* selected.
const ADMIN_CLIENT_SELECT = {
  id: true,
  nama: true,
  email: true,
  phone: true,
  instagram: true,
  storageQuotaGB: true,
  isApproved: true,
  createdAt: true,
  updatedAt: true,
} as const;

export type AdminClient = {
  id: string;
  nama: string;
  email: string;
  phone: string | null;
  instagram: string | null;
  storageQuotaGB: number;
  isApproved: boolean;
  // Date columns are sent across the wire as ISO strings to keep the
  // value JSON-serialisable for the `useTransition` round-trip.
  createdAt: string;
  updatedAt: string;
};

// `ActionResult` and `requireAdmin` are imported from
// `@/lib/actions/auth` so all Server Actions share the same auth
// contract. Re-export `ActionResult` for callers that previously
// imported it from this module.
export type { ActionResult };

const idSchema = z.string().min(1, 'Client id required');

const bulkIdsSchema = z
  .array(z.string().min(1))
  .min(1, 'At least one ID required')
  .max(100, 'Maximum 100 IDs per request');

// Convenience converter — every admin row response has its `Date`s already
// flattened to strings since the page treats them as strings (e.g. via
// `new Date(client.createdAt).toLocaleDateString`).
function toAdminClient(row: {
  id: string;
  nama: string;
  email: string;
  phone: string | null;
  instagram: string | null;
  storageQuotaGB: number;
  isApproved: boolean;
  createdAt: Date;
  updatedAt: Date;
}): AdminClient {
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Create a new client. The admin UI captures `password` in plaintext —
 * we hash it with bcrypt before storing and never echo any password
 * material back.
 */
export async function createClient(
  input: unknown,
): Promise<ActionResult<{ client: AdminClient }>> {
  const auth = await requireAdmin();
  if (!auth.success) return auth;

  const parsed = clientSchema.safeParse(input);
  if (!parsed.success) {
    const first = parsed.error.errors[0];
    return {
      success: false,
      error: first.path.length > 0
        ? `${first.path.join('.')}: ${first.message}`
        : first.message,
    };
  }

  try {
    const { password, ...rest } = parsed.data;
    const passwordHash = await hash(password, BCRYPT_ROUNDS);
    const created = await prisma.client.create({
      data: { ...rest, password: passwordHash },
      select: ADMIN_CLIENT_SELECT,
    });
    revalidatePath('/admin/clients');
    return { success: true, data: { client: toAdminClient(created) } };
  } catch (e) {
    if (e && typeof e === 'object' && 'code' in e && e.code === 'P2002') {
      return { success: false, error: 'Email sudah terdaftar' };
    }
    logger.error('action.clients.create.failed', { err: e });
    return { success: false, error: 'Failed to create client' };
  }
}

/**
 * Update an existing client. `password` is optional — when present we
 * hash + persist, when absent we *do not* touch the existing hash. This
 * matches the "leave the field blank to keep current" UX in the admin
 * edit dialog.
 */
export async function updateClient(input: {
  id: string;
} & Record<string, unknown>): Promise<ActionResult<{ client: AdminClient }>> {
  const auth = await requireAdmin();
  if (!auth.success) return auth;

  const idParsed = idSchema.safeParse(input.id);
  if (!idParsed.success) {
    return { success: false, error: 'Client id required' };
  }

  // `clientUpdateSchema` is `clientSchema.partial()` so every field is
  // optional. We strip the `id` before validating because schemas in
  // `validation.ts` deliberately don't model it.
  const { id: _id, ...rest } = input;
  void _id;
  const parsed = clientUpdateSchema.safeParse(rest);
  if (!parsed.success) {
    const first = parsed.error.errors[0];
    return {
      success: false,
      error: first.path.length > 0
        ? `${first.path.join('.')}: ${first.message}`
        : first.message,
    };
  }

  try {
    // Same payload massage as the REST PATCH: hash if a non-empty
    // password was supplied, drop the field otherwise so we don't
    // overwrite the current hash with `null`.
    const data: Record<string, unknown> = { ...parsed.data };
    if (typeof data.password === 'string' && data.password.length > 0) {
      data.password = await hash(data.password, BCRYPT_ROUNDS);
    } else {
      delete data.password;
    }

    const updated = await prisma.client.update({
      where: { id: idParsed.data },
      data,
      select: ADMIN_CLIENT_SELECT,
    });
    revalidatePath('/admin/clients');
    return { success: true, data: { client: toAdminClient(updated) } };
  } catch (e) {
    if (e && typeof e === 'object' && 'code' in e) {
      if (e.code === 'P2002') return { success: false, error: 'Email sudah terdaftar' };
      if (e.code === 'P2025') return { success: false, error: 'Client not found' };
    }
    logger.error('action.clients.update.failed', { id: input.id, err: e });
    return { success: false, error: 'Failed to update client' };
  }
}

/**
 * Convenience action for the dashboard "Setujui" button — flips
 * `isApproved` to `true` so a booking-created client can sign in to
 * the portal.
 */
export async function approveClient(
  rawId: string,
): Promise<ActionResult<{ client: AdminClient }>> {
  const auth = await requireAdmin();
  if (!auth.success) return auth;

  const idParsed = idSchema.safeParse(rawId);
  if (!idParsed.success) {
    return { success: false, error: 'Client id required' };
  }

  try {
    const updated = await prisma.client.update({
      where: { id: idParsed.data },
      data: { isApproved: true },
      select: ADMIN_CLIENT_SELECT,
    });
    revalidatePath('/admin/clients');
    return { success: true, data: { client: toAdminClient(updated) } };
  } catch (e) {
    if (e && typeof e === 'object' && 'code' in e && e.code === 'P2025') {
      return { success: false, error: 'Client not found' };
    }
    logger.error('action.clients.approve.failed', { id: rawId, err: e });
    return { success: false, error: 'Failed to approve client' };
  }
}

/**
 * Delete a single client. The Client→Event→Gallery→Photo cascade nukes
 * all dependent rows; we still need to enqueue R2/Cloudinary cleanup for
 * the photos that lived in those galleries (DB cascade alone leaves
 * orphans in storage). Mirrors the `events.ts` ordering: collect →
 * DB-first delete → best-effort enqueue with outbox fallback.
 *
 * `usedStorage` does NOT need decrementing here because the row holding
 * it is the row being deleted.
 */
export async function deleteClient(
  rawId: string,
): Promise<ActionResult<{ id: string }>> {
  const auth = await requireAdmin();
  if (!auth.success) return auth;

  const idParsed = idSchema.safeParse(rawId);
  if (!idParsed.success) {
    return { success: false, error: 'Client id required' };
  }
  const id = idParsed.data;

  try {
    const deletionPayloads = await collectPhotoDeletionPayloads({
      gallery: { event: { clientId: id } },
    });

    // Decrement StorageAccount counters using deletionPayloads. The
    // Client→Event→Gallery→Photo cascade only removes Photo rows; the
    // per-account `usedStorage` / `totalPhotos` columns must be adjusted
    // explicitly here, otherwise the dashboard counters drift over time.
    const storageUpdates = new Map<string, { usedStorage: bigint; totalPhotos: number }>();
    for (const p of deletionPayloads) {
      if (!p.storageAccountId) continue;
      const current = storageUpdates.get(p.storageAccountId) || { usedStorage: BigInt(0), totalPhotos: 0 };
      const size = p.r2Key && p.fileSize ? BigInt(p.fileSize) : BigInt(0);
      storageUpdates.set(p.storageAccountId, {
        usedStorage: current.usedStorage + size,
        totalPhotos: current.totalPhotos + 1,
      });
    }
    if (storageUpdates.size > 0) {
      await prisma.$transaction(
        Array.from(storageUpdates.entries()).map(([accountId, delta]) =>
          prisma.storageAccount.update({
            where: { id: accountId },
            data: {
              usedStorage: { decrement: delta.usedStorage },
              totalPhotos: { decrement: delta.totalPhotos },
            },
          })
        )
      );
    }

    await prisma.client.delete({ where: { id } });

    const outcome = await enqueueDeletionWithOutbox(deletionPayloads);
    if (outcome.outboxed > 0) {
      logger.warn('action.clients.delete.storage_outboxed', {
        clientId: id,
        photoCount: outcome.outboxed,
        outboxJobId: outcome.outboxJobId,
      });
    }

    revalidatePath('/admin/clients');
    return { success: true, data: { id } };
  } catch (e) {
    if (e && typeof e === 'object' && 'code' in e && e.code === 'P2025') {
      return { success: false, error: 'Client not found' };
    }
    logger.error('action.clients.delete.failed', { id, err: e });
    return { success: false, error: 'Failed to delete client' };
  }
}

/**
 * Bulk-delete clients. Same semantics as `deleteClient` but executes a
 * single `deleteMany` after collecting *all* the photos belonging to
 * any of the targeted clients.
 */
export async function deleteClientsBulk(
  rawIds: string[],
): Promise<ActionResult<{ deleted: number }>> {
  const auth = await requireAdmin();
  if (!auth.success) return auth;

  const parsed = bulkIdsSchema.safeParse(rawIds);
  if (!parsed.success) {
    return { success: false, error: parsed.error.errors[0].message };
  }
  const ids = parsed.data;

  try {
    const deletionPayloads = await collectPhotoDeletionPayloads({
      gallery: { event: { clientId: { in: ids } } },
    });

    // Decrement StorageAccount counters using deletionPayloads. The
    // Client→Event→Gallery→Photo cascade only removes Photo rows; the
    // per-account `usedStorage` / `totalPhotos` columns must be adjusted
    // explicitly here, otherwise the dashboard counters drift over time.
    const storageUpdates = new Map<string, { usedStorage: bigint; totalPhotos: number }>();
    for (const p of deletionPayloads) {
      if (!p.storageAccountId) continue;
      const current = storageUpdates.get(p.storageAccountId) || { usedStorage: BigInt(0), totalPhotos: 0 };
      const size = p.r2Key && p.fileSize ? BigInt(p.fileSize) : BigInt(0);
      storageUpdates.set(p.storageAccountId, {
        usedStorage: current.usedStorage + size,
        totalPhotos: current.totalPhotos + 1,
      });
    }
    if (storageUpdates.size > 0) {
      await prisma.$transaction(
        Array.from(storageUpdates.entries()).map(([accountId, delta]) =>
          prisma.storageAccount.update({
            where: { id: accountId },
            data: {
              usedStorage: { decrement: delta.usedStorage },
              totalPhotos: { decrement: delta.totalPhotos },
            },
          })
        )
      );
    }

    const result = await prisma.client.deleteMany({ where: { id: { in: ids } } });

    const outcome = await enqueueDeletionWithOutbox(deletionPayloads);
    if (outcome.outboxed > 0) {
      logger.warn('action.clients.delete_bulk.storage_outboxed', {
        clientCount: ids.length,
        photoCount: outcome.outboxed,
        outboxJobId: outcome.outboxJobId,
      });
    }

    revalidatePath('/admin/clients');
    return { success: true, data: { deleted: result.count } };
  } catch (e) {
    logger.error('action.clients.delete_bulk.failed', { count: ids.length, err: e });
    return { success: false, error: 'Failed to delete clients' };
  }
}
