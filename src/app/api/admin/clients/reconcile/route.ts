import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { successResponse, serverErrorResponse } from '@/lib/api/response';
import { requireAdminAuth } from '@/lib/auth/require-admin-auth';
import { RATE_LIMITS } from '@/lib/rate-limit';
import { enforceRateLimit } from '@/lib/rate-limit-helper';
import { logger } from '@/lib/logger';
import { Prisma } from '@/generated/prisma';

/**
 * Counter reconciliation endpoint.
 *
 * Sprint 2 Task 2.4: `Client.usedStorage` and `Client.photoCount` are
 * denormalized counters maintained by upload/delete flows. Race
 * conditions, partial rollbacks (storage account update succeeds but
 * Photo.create fails after compensating decrement raced with another
 * upload), or manual DB edits can drift these values from the actual
 * `Photo` rows.
 *
 * This endpoint recalculates the canonical aggregates and writes them
 * back. It's idempotent — running it on a healthy DB is a no-op.
 *
 * Two phases:
 *   1. SELECT — compute the correct (storage, count) per client by
 *      summing/counting `Photo` rows joined through `Gallery` →
 *      `Event` → `clientId`. Done with `$queryRaw` so we get the
 *      aggregate in a single round trip and don't load every photo
 *      into memory.
 *   2. UPDATE — write back via a `transaction` of `client.update`
 *      calls but ONLY for clients whose stored values diverge from the
 *      computed ones. Skipping no-op writes keeps audit logs clean and
 *      cuts DB load when most clients are already in sync.
 *
 * Returns:
 *   ```json
 *   {
 *     "reconciled": <number_of_clients_updated>,
 *     "scanned":    <total_clients_scanned>,
 *     "clients":    [{ id, nama, before, after, drift }, ...]
 *   }
 *   ```
 *
 * The `clients` array only includes those that drifted — empty array
 * means everything was already correct.
 *
 * Auth: admin-only via `requireAdminAuth`. Rate-limited via
 * `RATE_LIMITS.ADMIN_WRITE` because this is a write operation that
 * touches many rows.
 */

interface ClientAggregate {
  id: string;
  nama: string;
  storedStorage: bigint;
  storedCount: number;
  computedStorage: bigint;
  computedCount: number;
}

interface ReconcileEntry {
  id: string;
  nama: string;
  before: { usedStorage: string; photoCount: number };
  after: { usedStorage: string; photoCount: number };
  drift: { usedStorage: string; photoCount: number };
}

export async function POST(request: Request) {
  try {
    const auth = await requireAdminAuth();
    if (auth instanceof NextResponse) return auth;

    // Rate limiting — this is a heavy operation; cap to admin-write limits.
    const rateLimit = await enforceRateLimit({
      identifier: `clients-reconcile:post:${auth.user.email}`,
      limit: RATE_LIMITS.ADMIN_WRITE,
    });
    if (rateLimit) return rateLimit;

    // Parse query params for optional client scoping. `?clientId=xxx`
    // limits reconciliation to a single client (useful for ad-hoc fixes
    // when an operator suspects drift on one account); omit to scan all.
    const url = new URL(request.url);
    const clientId = url.searchParams.get('clientId');

    // Phase 1: compute canonical aggregates per client via a single
    // grouped JOIN. LEFT JOINs so clients with zero photos still
    // appear with computed=0 (drift correction case: stored>0 but
    // actually 0).
    const aggregates = await prisma.$queryRaw<ClientAggregate[]>(
      clientId
        ? Prisma.sql`
            SELECT
              c."id",
              c."nama",
              c."usedStorage" AS "storedStorage",
              c."photoCount"  AS "storedCount",
              COALESCE(SUM(p."fileSize"), 0)::bigint AS "computedStorage",
              COALESCE(COUNT(p.id), 0)::int          AS "computedCount"
            FROM "Client" c
            LEFT JOIN "Event"   e ON e."clientId"  = c.id
            LEFT JOIN "Gallery" g ON g."eventId"   = e.id
            LEFT JOIN "Photo"   p ON p."galleryId" = g.id
            WHERE c.id = ${clientId}
            GROUP BY c.id, c.nama, c."usedStorage", c."photoCount"
          `
        : Prisma.sql`
            SELECT
              c."id",
              c."nama",
              c."usedStorage" AS "storedStorage",
              c."photoCount"  AS "storedCount",
              COALESCE(SUM(p."fileSize"), 0)::bigint AS "computedStorage",
              COALESCE(COUNT(p.id), 0)::int          AS "computedCount"
            FROM "Client" c
            LEFT JOIN "Event"   e ON e."clientId"  = c.id
            LEFT JOIN "Gallery" g ON g."eventId"   = e.id
            LEFT JOIN "Photo"   p ON p."galleryId" = g.id
            GROUP BY c.id, c.nama, c."usedStorage", c."photoCount"
          `,
    );

    // Phase 2: identify drift and write fixes inside a single
    // transaction. Skip clients whose stored values already match
    // computed — keeps the result tight and the audit log meaningful.
    const drifted: ReconcileEntry[] = [];
    const updates: Prisma.PrismaPromise<unknown>[] = [];

    for (const agg of aggregates) {
      const storageDrift = agg.computedStorage - agg.storedStorage;
      const countDrift = agg.computedCount - agg.storedCount;
      // BigInt literal `0n` would require ES2020 target; use BigInt(0)
      // for compatibility with the project's tsconfig target.
      if (storageDrift === BigInt(0) && countDrift === 0) continue;

      drifted.push({
        id: agg.id,
        nama: agg.nama,
        before: {
          usedStorage: agg.storedStorage.toString(),
          photoCount: agg.storedCount,
        },
        after: {
          usedStorage: agg.computedStorage.toString(),
          photoCount: agg.computedCount,
        },
        drift: {
          usedStorage: storageDrift.toString(),
          photoCount: countDrift,
        },
      });

      updates.push(
        prisma.client.update({
          where: { id: agg.id },
          data: {
            usedStorage: agg.computedStorage,
            photoCount: agg.computedCount,
          },
        }),
      );
    }

    if (updates.length > 0) {
      await prisma.$transaction(updates);
    }

    logger.info('clients.reconcile.completed', {
      scanned: aggregates.length,
      reconciled: drifted.length,
      scopedToClientId: clientId ?? null,
      adminEmail: auth.user.email,
    });

    return successResponse({
      reconciled: drifted.length,
      scanned: aggregates.length,
      clients: drifted,
    });
  } catch (error) {
    logger.error('[API] clients.reconcile.unhandled_error', { err: error });
    return serverErrorResponse('Failed to reconcile client counters');
  }
}
