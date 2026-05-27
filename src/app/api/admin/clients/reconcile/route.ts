import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { successResponse, errorResponse, serverErrorResponse } from '@/lib/api/response';
import { requireAdminAuth } from '@/lib/auth/require-admin-auth';
import { RATE_LIMITS } from '@/lib/rate-limit';
import { enforceRateLimit } from '@/lib/rate-limit-helper';
import { logger } from '@/lib/logger';
import { Prisma } from '@/generated/prisma';
import { withRequestContext } from '@/lib/with-request-context';
import { enforceBodySizeLimit, BODY_LIMITS } from '@/lib/api/body-size-limit';

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
 *   1. SELECT — compute the correct (storage, count) per client.
 *      `photoCount` is a simple COUNT of Photo rows joined through
 *      Gallery → Event → clientId. `usedStorage` is the sum of
 *      `fileSize` over UNIQUE `r2Key` values per client (cross-gallery
 *      dedup: the same client can re-upload an identical file to a
 *      different gallery, and the upload flow rolls back the second
 *      increment so `usedStorage` only counts each underlying R2
 *      object once — see `src/app/api/admin/upload/complete/route.ts`
 *      "CRITICAL FIX #10 / PR #76 — Cross-gallery dedup per-client").
 *      A naive SUM(fileSize) over all rows would inflate the counter
 *      for clients that hit the dedup path. Done with `$queryRaw` so
 *      we get the aggregate in a single round trip and don't load
 *      every photo into memory.
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

export const POST = withRequestContext(async (request: Request) => {
  try {
    const auth = await requireAdminAuth();
    if (auth instanceof NextResponse) return auth;

    // Rate limiting — this is a heavy operation; cap to admin-write limits.
    const rateLimit = await enforceRateLimit({
      identifier: `clients-reconcile:post:${auth.user.email}`,
      limit: RATE_LIMITS.ADMIN_WRITE,
    });
    if (rateLimit) return rateLimit;

    const tooLarge = enforceBodySizeLimit(request, BODY_LIMITS.JSON_SMALL);
    if (tooLarge) return tooLarge;

    // Parse query params for optional client scoping. `?clientId=xxx`
    // limits reconciliation to a single client (useful for ad-hoc
    // fixes when an operator suspects drift on one account); omit to
    // scan all. CodeAnt MAJOR (PR #115): treat `?clientId=` (empty
    // string) as a malformed request rather than silently falling
    // through to the scan-all branch — a typo or stripped param could
    // otherwise trigger a full reconciliation unintentionally.
    const url = new URL(request.url);
    const clientIdRaw = url.searchParams.get('clientId');
    const clientId = clientIdRaw?.trim();
    if (clientIdRaw !== null && (clientId === undefined || clientId === '')) {
      return errorResponse(
        'clientId query param must be a non-empty string when provided',
        400,
      );
    }

    // Phase 1: compute canonical aggregates per client.
    //
    // CodeAnt CRITICAL (PR #115): a naive `SUM(p."fileSize")` over all
    // Photo rows would inflate `usedStorage` for clients that hit the
    // cross-gallery dedup path (the same client uploaded an identical
    // file to a different gallery, the upload flow rolled back the
    // second quota increment, and `Client.usedStorage` is documented
    // as "unique bytes per client"). The reconciliation must follow
    // the same definition or it will "reconcile" already-correct
    // counters to wrong values.
    //
    // We sum over a per-client DISTINCT projection of `(r2Key,
    // fileSize)` so each underlying R2 object contributes exactly once
    // per client, even if multiple Photo rows reference it. Photos
    // without an r2Key (legacy / pre-R2 rows) are also deduped by id
    // so they never contribute more than once. `photoCount` stays a
    // straight COUNT — that field tracks Photo rows, not unique R2
    // objects, and is incremented per row at upload time.
    const aggregates = await prisma.$queryRaw<ClientAggregate[]>(
      clientId
        ? Prisma.sql`
            WITH client_photos AS (
              SELECT
                e."clientId" AS client_id,
                p.id         AS photo_id,
                p."r2Key"    AS r2_key,
                p."fileSize" AS file_size
              FROM "Photo"   p
              JOIN "Gallery" g ON g.id = p."galleryId"
              JOIN "Event"   e ON e.id = g."eventId"
              WHERE e."clientId" = ${clientId}
            ),
            unique_objects AS (
              -- Dedup by r2Key per client (cross-gallery dedup case).
              -- Rows without r2Key fall back to photo_id so they
              -- don't all collapse into a single bucket.
              SELECT DISTINCT ON (client_id, COALESCE(r2_key, photo_id))
                client_id,
                file_size
              FROM client_photos
            )
            SELECT
              c."id",
              c."nama",
              c."usedStorage" AS "storedStorage",
              c."photoCount"  AS "storedCount",
              COALESCE((SELECT SUM(file_size) FROM unique_objects WHERE client_id = c.id), 0)::bigint AS "computedStorage",
              COALESCE((SELECT COUNT(*)       FROM client_photos  WHERE client_id = c.id), 0)::int    AS "computedCount"
            FROM "Client" c
            WHERE c.id = ${clientId}
          `
        : Prisma.sql`
            WITH client_photos AS (
              SELECT
                e."clientId" AS client_id,
                p.id         AS photo_id,
                p."r2Key"    AS r2_key,
                p."fileSize" AS file_size
              FROM "Photo"   p
              JOIN "Gallery" g ON g.id = p."galleryId"
              JOIN "Event"   e ON e.id = g."eventId"
            ),
            unique_objects AS (
              SELECT DISTINCT ON (client_id, COALESCE(r2_key, photo_id))
                client_id,
                file_size
              FROM client_photos
            ),
            unique_storage AS (
              SELECT client_id, COALESCE(SUM(file_size), 0)::bigint AS total
              FROM unique_objects
              GROUP BY client_id
            ),
            photo_counts AS (
              SELECT client_id, COUNT(*)::int AS total
              FROM client_photos
              GROUP BY client_id
            )
            SELECT
              c."id",
              c."nama",
              c."usedStorage" AS "storedStorage",
              c."photoCount"  AS "storedCount",
              COALESCE(us.total, 0)::bigint AS "computedStorage",
              COALESCE(pc.total, 0)::int    AS "computedCount"
            FROM "Client" c
            LEFT JOIN unique_storage us ON us.client_id = c.id
            LEFT JOIN photo_counts   pc ON pc.client_id = c.id
          `,
    );

    // Phase 2: identify drift and write fixes inside a single
    // transaction. Skip clients whose stored values already match
    // computed — keeps the result tight and the audit log meaningful.
    const drifted: ReconcileEntry[] = [];
    const updates: Prisma.PrismaPromise<unknown>[] = [];

    for (const agg of aggregates) {
      const storageDrift: bigint =
        BigInt(agg.computedStorage) - BigInt(agg.storedStorage);
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
});
