/**
 * Cloudflare Queue Publisher with Enhanced Error Handling
 * 
 * Used by Vercel (Next.js) to publish messages to Cloudflare Queue
 * 
 * Features:
 * - Retry logic with exponential backoff
 * - Error tracking and logging
 * - Batch processing for bulk operations
 * 
 * Environment variables needed:
 * - CLOUDFLARE_ACCOUNT_ID
 * - NEXT_SERVER_CF_QUEUE_TOKEN (with Queue write permission)
 * - CLOUDFLARE_WORKER_URL (deletion worker endpoint, required for enqueue calls)
 */

import { prisma } from '@/lib/db';
import { Prisma } from '@/generated/prisma';
import { recordFailedJob } from '@/lib/failed-jobs';
import { env } from '@/lib/env.server';
import { getRequestId } from '@/lib/request-context';
import { REQUEST_ID_HEADER } from '@/lib/request-id-constants';
import { logger } from '@/lib/logger';

const ACCOUNT_ID = env.CLOUDFLARE_ACCOUNT_ID;
const API_TOKEN = env.NEXT_SERVER_CF_QUEUE_TOKEN;
const WORKER_URL = env.CLOUDFLARE_WORKER_URL;

// Retry configuration
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY_MS = 1000; // 1 second
const MAX_RETRY_DELAY_MS = 10000; // 10 seconds

// Bulk-delete fan-out concurrency.
//
// `queueStorageDeletionBulk` POSTs once per payload to the deletion
// worker. Sequential `await` (the previous implementation) hit ~200ms
// per call, so 100 items took ~20s — perilously close to Vercel's 30s
// admin-route timeout. With 10 in flight, 100 items complete in ~2s.
//
// Tuned conservatively to stay under the worker's effective rate
// budget while still giving us headroom on the function timeout.
const BULK_DELETE_CONCURRENCY = 10;

/**
 * Sleep utility for retry delays
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Calculate exponential backoff delay
 */
function getRetryDelay(attempt: number): number {
  const delay = INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt);
  return Math.min(delay, MAX_RETRY_DELAY_MS);
}

/**
 * Enhanced error logging with context
 */
function logQueueError(context: string, error: unknown, metadata?: Record<string, unknown>): void {
  logger.error('queue.error', {
    context,
    err: error,
    ...metadata,
  });
}

/**
 * Publish message to Cloudflare Queue via REST API with retry logic.
 *
 * Sprint 3 / Task 3.1: when called from inside a request scope, the
 * current `requestId` is auto-merged into the message body under
 * `requestId` so downstream queue consumers (and any webhook
 * callbacks they emit back) can echo the same correlation ID.
 * Callers can override by setting `requestId` on the message
 * themselves.
 */
export async function publishToQueue(
  queueName: string,
  message: unknown,
  options?: { delaySeconds?: number }
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  if (!ACCOUNT_ID || !API_TOKEN) {
    logQueueError('Missing credentials', new Error('CLOUDFLARE_ACCOUNT_ID or NEXT_SERVER_CF_QUEUE_TOKEN not set'));
    return { success: false, error: 'Missing credentials' };
  }

  // Auto-attach the current request's correlation ID to the message
  // body so the consumer (Cloudflare Worker) can include it on any
  // webhook callback it sends back. We only inject when the message
  // is a plain object AND doesn't already carry an explicit
  // `requestId`.
  const requestId = getRequestId();
  let enrichedMessage: unknown = message;
  if (
    requestId &&
    typeof message === 'object' &&
    message !== null &&
    !Array.isArray(message) &&
    !('requestId' in (message as Record<string, unknown>))
  ) {
    enrichedMessage = { ...(message as Record<string, unknown>), requestId };
  }

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/queues/${queueName}/messages`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${API_TOKEN}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messages: [{
              body: enrichedMessage,
              delay_seconds: options?.delaySeconds,
            }],
          }),
        }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        const errorMsg = data.errors?.[0]?.message || 'Failed to publish';
        lastError = new Error(errorMsg);
        
        // Log error with attempt number
        logQueueError(`Publish failed (attempt ${attempt + 1}/${MAX_RETRIES + 1})`, lastError, {
          queueName,
          statusCode: response.status,
          responseData: data,
        });

        // Don't retry on client errors (4xx)
        if (response.status >= 400 && response.status < 500) {
          return { success: false, error: errorMsg };
        }

        // Retry on server errors (5xx) or network issues
        if (attempt < MAX_RETRIES) {
          const delay = getRetryDelay(attempt);
          logger.info('queue.retry', { queueName, attempt: attempt + 1, delayMs: delay });
          await sleep(delay);
          continue;
        }

        return { success: false, error: errorMsg };
      }

      // Success
      if (attempt > 0) {
        logger.info('queue.publish.success_after_retry', { queueName, attempts: attempt + 1 });
      }

      return {
        success: true,
        messageId: data.result?.message_ids?.[0],
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Unknown error');
      
      logQueueError(`Network error (attempt ${attempt + 1}/${MAX_RETRIES + 1})`, lastError, {
        queueName,
      });

      // Retry on network errors
      if (attempt < MAX_RETRIES) {
        const delay = getRetryDelay(attempt);
        logger.info('queue.retry', { queueName, attempt: attempt + 1, delayMs: delay });
        await sleep(delay);
        continue;
      }

      return {
        success: false,
        error: lastError.message,
      };
    }
  }

  // Should never reach here, but TypeScript needs it
  return {
    success: false,
    error: lastError?.message || 'Max retries exceeded',
  };
}


/**
 * Queue storage deletion job
 */
export async function queueStorageDeletion(data: {
  photoId: string;
  r2Key?: string | null;
  thumbnailUrl?: string | null;
  fileSize?: string;
  storageAccountId?: string | null;
  cloudinaryCredentials?: {
    cloudName?: string | null;
    apiKey?: string | null;
    apiSecret?: string | null;
  } | null;
}): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const requestId = getRequestId();
    const response = await fetch(`${WORKER_URL}/queue/deletion`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(requestId ? { [REQUEST_ID_HEADER]: requestId } : {}),
      },
      body: JSON.stringify({
        type: 'storage-deletion',
        timestamp: Date.now(),
        ...(requestId ? { requestId } : {}),
        photoId: data.photoId,
        r2Key: data.r2Key || undefined,
        thumbnailUrl: data.thumbnailUrl || undefined,
        fileSize: data.fileSize,
        storageAccountId: data.storageAccountId || undefined,
        cloudinaryCredentials: data.cloudinaryCredentials || undefined,
      }),
    });

    const result = await response.json();
    if (!result.success) {
      // Record failed job after queue publish fails
      await recordFailedJob({
        jobType: 'storage-deletion',
        payload: {
          photoId: data.photoId,
          r2Key: data.r2Key,
          thumbnailUrl: data.thumbnailUrl,
          fileSize: data.fileSize,
          storageAccountId: data.storageAccountId,
          cloudinaryCredentials: data.cloudinaryCredentials ? {
            cloudName: data.cloudinaryCredentials.cloudName,
            apiKey: data.cloudinaryCredentials.apiKey,
            apiSecret: '[REDACTED]',
          } : undefined,
        },
        errorMessage: result.error || 'Worker returned failure',
      }).catch((err) => {
        logger.error('queue.deletion.record_failed_job_failed', { photoId: data.photoId, err });
      });
      return { success: false, error: result.error || 'Failed to queue' };
    }
    return { success: true };
  } catch (error) {
    logger.error('queue.deletion.publish_failed', { photoId: data.photoId, err: error });
    // Record failed job on exception
    await recordFailedJob({
      jobType: 'storage-deletion',
      payload: {
        photoId: data.photoId,
        r2Key: data.r2Key,
        thumbnailUrl: data.thumbnailUrl,
        fileSize: data.fileSize,
        storageAccountId: data.storageAccountId,
        cloudinaryCredentials: data.cloudinaryCredentials ? {
          cloudName: data.cloudinaryCredentials.cloudName,
          apiKey: data.cloudinaryCredentials.apiKey,
          apiSecret: '[REDACTED]',
        } : undefined,
      },
      errorMessage: String(error),
    }).catch((err) => {
      logger.error('queue.deletion.record_failed_job_failed', { photoId: data.photoId, err });
    });
    return { success: false, error: String(error) };
  }
}

/**
 * Queue multiple storage deletion jobs in bulk.
 *
 * Sends one POST per payload to the deletion worker, but runs up to
 * {@link BULK_DELETE_CONCURRENCY} requests in flight at a time using a
 * lock-free worker pool. With ~200ms per request, 100 items finish in
 * ~2s instead of the ~20s that the previous sequential `for...await`
 * implementation took (uncomfortably close to Vercel's 30s function
 * timeout for /api/admin/* routes).
 *
 * Audit: docs/audit-tasks.md Task 1.5 (Sprint 1).
 *
 * Per-item failures are still tracked individually via `failedCount`,
 * and the first observed error message is surfaced as `error`. The
 * deletion worker keys on `photoId` so retries are idempotent.
 */
export async function queueStorageDeletionBulk(dataList: Array<{
  photoId: string;
  r2Key?: string | null;
  thumbnailUrl?: string | null;
  fileSize?: string;
  storageAccountId?: string | null;
  cloudinaryCredentials?: {
    cloudName?: string | null;
    apiKey?: string | null;
    apiSecret?: string | null;
  } | null;
}>): Promise<{ success: boolean; error?: string; failedCount?: number }> {
  if (dataList.length === 0) {
    return { success: true };
  }

  // Worker-pool concurrency. Tuned to balance fan-out latency against
  // worker-side rate limits and Vercel function memory: too high and we
  // can starve the worker / blow request quotas, too low and we hit the
  // 30s timeout on a 100-item batch.
  const MAX_CONCURRENT = Math.min(BULK_DELETE_CONCURRENCY, dataList.length);

  let failedCount = 0;
  let lastError: string | undefined;
  let cursor = 0;

  // Each worker pulls the next index off a shared cursor. JS's single
  // event loop makes the `cursor++` post-increment and `failedCount++`
  // atomic between awaits — no semaphore / p-limit needed. (If this
  // module is ever ported to a worker-threaded runtime this assumption
  // breaks; revisit then.)
  const runWorker = async (): Promise<void> => {
    while (cursor < dataList.length) {
      // `cursor++` returns the pre-increment value, so `index` is always
      // a valid in-bounds index when the while-check passed.
      const index = cursor++;
      const result = await queueStorageDeletion(dataList[index]);
      if (!result.success) {
        failedCount++;
        if (!lastError) {
          lastError = result.error;
        }
      }
    }
  };

  await Promise.all(
    Array.from({ length: MAX_CONCURRENT }, () => runWorker()),
  );

  if (failedCount > 0) {
    return {
      success: false,
      error: lastError || 'Some deletions failed',
      failedCount,
    };
  }

  return { success: true };
}

/**
 * Queue thumbnail generation job
 */
export async function queueThumbnailGeneration(data: {
  photoId: string;
  r2Key: string;
  galleryId: string;
  filename: string;
  cloudinaryCredentials: {
    cloudName: string | null;
    apiKey: string | null;
    apiSecret: string | null;
  };
}): Promise<{ success: boolean; messageId?: string; error?: string }> {
  if (!data.cloudinaryCredentials.cloudName || !data.cloudinaryCredentials.apiKey || !data.cloudinaryCredentials.apiSecret) {
    logger.warn('queue.thumbnail.missing_credentials', { photoId: data.photoId });
    return { success: false, error: 'Missing Cloudinary credentials' };
  }

  try {
    const requestId = getRequestId();
    const response = await fetch(`${WORKER_URL}/queue/thumbnail`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(requestId ? { [REQUEST_ID_HEADER]: requestId } : {}),
      },
      body: JSON.stringify({
        type: 'thumbnail-generation',
        timestamp: Date.now(),
        ...(requestId ? { requestId } : {}),
        photoId: data.photoId,
        r2Key: data.r2Key,
        galleryId: data.galleryId,
        filename: data.filename,
        cloudinaryCredentials: {
          cloudName: data.cloudinaryCredentials.cloudName,
          apiKey: data.cloudinaryCredentials.apiKey,
          apiSecret: data.cloudinaryCredentials.apiSecret,
        },
      }),
    });

    const result = await response.json();
    if (!result.success) {
      // Record failed job after queue publish fails
      await recordFailedJob({
        jobType: 'thumbnail-generation',
        payload: {
          photoId: data.photoId,
          r2Key: data.r2Key,
          galleryId: data.galleryId,
          filename: data.filename,
          cloudinaryCredentials: {
            cloudName: data.cloudinaryCredentials.cloudName,
            apiKey: data.cloudinaryCredentials.apiKey,
            apiSecret: '[REDACTED]',
          },
        },
        errorMessage: result.error || 'Worker returned failure',
      }).catch((err) => {
        logger.error('queue.thumbnail.record_failed_job_failed', { photoId: data.photoId, err });
      });
      return { success: false, error: result.error || 'Failed to queue' };
    }
    return { success: true };
  } catch (error) {
    logger.error('queue.thumbnail.publish_failed', { photoId: data.photoId, err: error });
    // Record failed job on exception
    await recordFailedJob({
      jobType: 'thumbnail-generation',
      payload: {
        photoId: data.photoId,
        r2Key: data.r2Key,
        galleryId: data.galleryId,
        filename: data.filename,
        cloudinaryCredentials: {
          cloudName: data.cloudinaryCredentials.cloudName,
          apiKey: data.cloudinaryCredentials.apiKey,
          apiSecret: '[REDACTED]',
        },
      },
      errorMessage: String(error),
    }).catch((err) => {
      logger.error('queue.thumbnail.record_failed_job_failed', { photoId: data.photoId, err });
    });
    return { success: false, error: String(error) };
  }
}

/**
 * Check if Cloudflare Queue is configured
 */
export function isQueueConfigured(): boolean {
  return !!ACCOUNT_ID && !!API_TOKEN;
}

/**
 * Photo deletion payload — exposed so REST endpoints / Server Actions
 * that follow the **collect-then-delete-then-enqueue** ordering can hold
 * onto the value across the DB transaction.
 *
 * Review #73-2 (Gemini): `clientId` is denormalised onto the payload so
 * callers don't have to re-issue a `prisma.photo.findMany` to compute
 * the per-client `usedStorage` decrement. Together with `fileSize`
 * (already a string for `BigInt` portability) it lets the caller derive
 * the same `usedByClient` map that `collectPhotoDeletionPayloads` would
 * otherwise force them to fetch a second time.
 */
export interface PhotoDeletionPayload {
  photoId: string;
  // The owning client of the photo via Photo→Gallery→Event. Nullable
  // because the cascade target may have already orphaned the relation
  // by the time a retry runs through the outbox; consumers that need
  // the value should treat `null` as "unknown — fall back to the
  // explicit per-row decrement path".
  clientId: string | null;
  r2Key: string | null;
  thumbnailUrl: string | null;
  storageAccountId: string | null;
  // Stringified BigInt so the value survives JSON round-trips (e.g.
  // when persisted into `FailedJob.payload`).
  fileSize: string | undefined;
  cloudinaryCredentials: {
    cloudName: string | null;
    apiKey: string | null;
    apiSecret: string | null;
  } | null;
}

/**
 * Strip secret material out of a payload before it is persisted into
 * the `FailedJob` outbox.
 *
 * Review #73-1 (CodeAnt): `enqueueDeletionWithOutbox` previously stored
 * the *full* `cloudinaryCredentials.apiSecret` into
 * `FailedJob.payload`, even though every other call to `recordFailedJob`
 * in this module already redacts the value. The outbox is exposed via
 * `/api/admin/failed-jobs` and admin UIs, so the leak isn't theoretical.
 *
 * Retries reload credentials from `StorageAccount` keyed by
 * `storageAccountId`, so dropping the secret here is loss-free for the
 * recovery path.
 */
function redactPayloadSecrets(payload: PhotoDeletionPayload): PhotoDeletionPayload {
  if (!payload.cloudinaryCredentials) return payload;
  return {
    ...payload,
    cloudinaryCredentials: {
      cloudName: payload.cloudinaryCredentials.cloudName,
      apiKey: payload.cloudinaryCredentials.apiKey,
      apiSecret: '[REDACTED]',
    },
  };
}

function redactPayloadsForOutbox(
  payloads: PhotoDeletionPayload[],
): Record<string, unknown>[] {
  return payloads.map((p) => redactPayloadSecrets(p) as unknown as Record<string, unknown>);
}

/**
 * Cross-gallery dedup support (PR #75 / issue #10).
 *
 * After a client uploads the same file twice — once to gallery A, once to
 * gallery B — the second upload reuses the first photo's `r2Key` /
 * `thumbnailUrl` / `publicId` so we don't pay the storage twice. That
 * means deleting one of the photo rows must NOT delete the underlying R2
 * object as long as the *other* photo still references it.
 *
 * `getOrphanedR2Keys` returns the subset of `r2Keys` that have no other
 * `Photo` row referencing them outside `excludePhotoIds`. Callers should
 * use the returned set as a guard before enqueuing R2 deletions and
 * before decrementing `Client.usedStorage`.
 *
 * `excludePhotoIds` is the list of photos about to be deleted — those
 * rows themselves should NOT count as a still-living reference.
 *
 * Empty input arrays short-circuit to an empty set so the helper is
 * cheap on the hot path (most deletes have no shared keys).
 */
export async function getOrphanedR2Keys(
  r2Keys: readonly string[],
  excludePhotoIds: readonly string[],
): Promise<Set<string>> {
  // Drop falsy / duplicated values so we never run a `WHERE r2Key IN ('')`
  // or hit Postgres' `IN (...)` parameter ceiling on huge bulk deletes.
  const uniqueR2Keys = Array.from(new Set(r2Keys.filter(Boolean)));
  if (uniqueR2Keys.length === 0) return new Set();

  // Find every `r2Key` that *still* has a Photo row referencing it after
  // the delete batch has been applied. Anything in `uniqueR2Keys` that
  // doesn't show up here is therefore orphan-after-delete.
  const stillReferenced = await prisma.photo.findMany({
    where: {
      r2Key: { in: uniqueR2Keys },
      id: { notIn: Array.from(excludePhotoIds) },
    },
    select: { r2Key: true },
    distinct: ['r2Key'],
  });
  const stillSet = new Set(
    stillReferenced
      .map((p: (typeof stillReferenced)[number]) => p.r2Key)
      .filter((k: string | null): k is string => Boolean(k)),
  );

  const orphaned = new Set<string>();
  for (const k of uniqueR2Keys) {
    if (!stillSet.has(k)) orphaned.add(k);
  }
  return orphaned;
}

/**
 * Combined helper that returns both storage delta and deletion payloads
 * in a single database round-trip. Eliminates redundant queries when
 * both values are needed (e.g., REST deletion endpoints).
 *
 * Review #96 (Gemini): `computeUsedStorageDeltaForDeletion` and
 * `collectPhotoDeletionPayloads` previously issued separate `findMany`
 * queries with identical `whereCriteria`, causing double database hits.
 */
export async function collectDeletionDataForTransaction(
  whereCriteria: Prisma.PhotoWhereInput,
): Promise<{
  usedByClient: Map<string, bigint>;
  photoCountByClient: Map<string, number>;
  payloads: PhotoDeletionPayload[];
}> {
  const photos = await prisma.photo.findMany({
    where: whereCriteria,
    select: {
      id: true,
      r2Key: true,
      thumbnailUrl: true,
      storageAccountId: true,
      fileSize: true,
      gallery: {
        select: {
          event: { select: { clientId: true } },
        },
      },
    },
  });

  if (photos.length === 0) {
    return { usedByClient: new Map(), photoCountByClient: new Map(), payloads: [] };
  }

  const orphanedR2Keys = await getOrphanedR2Keys(
    photos
      .map((p: (typeof photos)[number]) => p.r2Key)
      .filter((k: string | null): k is string => Boolean(k)),
    photos.map((p: (typeof photos)[number]) => p.id),
  );

  // Compute storage delta and photo count
  const usedByClient = new Map<string, bigint>();
  const photoCountByClient = new Map<string, number>();
  for (const p of photos) {
    const cid = p.gallery.event.clientId;
    
    // Always count photos
    photoCountByClient.set(cid, (photoCountByClient.get(cid) ?? 0) + 1);
    
    // Only count storage for orphaned files
    if (p.r2Key && !orphanedR2Keys.has(p.r2Key)) continue;
    const bytes = p.fileSize ?? BigInt(0);
    if (bytes <= BigInt(0)) continue;
    usedByClient.set(cid, (usedByClient.get(cid) ?? BigInt(0)) + bytes);
  }

  // Resolve Cloudinary credentials
  const uniqueStorageAccountIds = Array.from(
    new Set(photos.map((p: (typeof photos)[number]) => p.storageAccountId).filter(Boolean) as string[]),
  );
  const storageAccounts = uniqueStorageAccountIds.length
    ? await prisma.storageAccount.findMany({
        where: { id: { in: uniqueStorageAccountIds } },
        // Only select fields the deletion payload actually needs.
        // Avoids pulling rotation/secondary secrets and other sensitive
        // columns into Node memory just to build a Cloudinary creds map.
        select: {
          id: true,
          cloudName: true,
          apiKey: true,
          apiSecret: true,
        },
      })
    : [];
  const cloudinaryCredentialsMap = new Map<
    string,
    { cloudName: string | null; apiKey: string | null; apiSecret: string | null } | null
  >();
  for (const account of storageAccounts) {
    cloudinaryCredentialsMap.set(account.id, {
      cloudName: account.cloudName,
      apiKey: account.apiKey,
      apiSecret: account.apiSecret,
    });
  }

  const defaultCloudinaryAccount = await prisma.storageAccount.findFirst({
    where: { provider: 'CLOUDINARY', isActive: true },
    orderBy: [{ isDefault: 'desc' }, { priority: 'asc' }],
    // Only the Cloudinary credentials are consumed below; do not load
    // R2 / secondary / rotation columns we don't need here.
    select: {
      cloudName: true,
      apiKey: true,
      apiSecret: true,
    },
  });
  const defaultCloudinaryCredentials = defaultCloudinaryAccount
    ? {
        cloudName: defaultCloudinaryAccount.cloudName,
        apiKey: defaultCloudinaryAccount.apiKey,
        apiSecret: defaultCloudinaryAccount.apiSecret,
      }
    : null;

  // Build payloads
  const payloads = photos.map<PhotoDeletionPayload>((photo: (typeof photos)[number]) => {
    let cloudinaryCredentials = defaultCloudinaryCredentials;
    if (photo.storageAccountId && cloudinaryCredentialsMap.has(photo.storageAccountId)) {
      const accountCreds = cloudinaryCredentialsMap.get(photo.storageAccountId);
      if (accountCreds && accountCreds.cloudName && accountCreds.apiKey) {
        cloudinaryCredentials = accountCreds;
      }
    }
    const isShared =
      photo.r2Key !== null && photo.r2Key !== undefined && !orphanedR2Keys.has(photo.r2Key);
    return {
      photoId: photo.id,
      clientId: photo.gallery?.event?.clientId ?? null,
      r2Key: isShared ? null : photo.r2Key,
      thumbnailUrl: isShared ? null : photo.thumbnailUrl,
      storageAccountId: photo.storageAccountId,
      fileSize: photo.fileSize?.toString(),
      cloudinaryCredentials,
    };
  });

  return { usedByClient, photoCountByClient, payloads };
}

/**
 * Per-client byte delta produced by deleting the photos matched by
 * `whereCriteria`. Bytes are counted ONLY for photos whose `r2Key`
 * becomes orphan after the delete — otherwise the underlying file
 * stays in R2 and the storage was never "freed".
 *
 * Use the returned `Map<clientId, bigint>` to drive
 * `Client.usedStorage` decrements inside the same transaction that
 * runs `prisma.photo.deleteMany`. See `events.ts` / `clients.ts` /
 * `galleries.ts` Server Actions for the canonical caller pattern.
 *
 * @deprecated Use `collectDeletionDataForTransaction` when both delta
 * and payloads are needed to avoid redundant queries.
 */
export async function computeUsedStorageDeltaForDeletion(
  whereCriteria: Prisma.PhotoWhereInput,
): Promise<Map<string, bigint>> {
  const photos = await prisma.photo.findMany({
    where: whereCriteria,
    select: {
      id: true,
      r2Key: true,
      fileSize: true,
      gallery: { select: { event: { select: { clientId: true } } } },
    },
  });
  if (photos.length === 0) return new Map();

  const orphaned = await getOrphanedR2Keys(
    photos
      .map((p: (typeof photos)[number]) => p.r2Key)
      .filter((k: string | null): k is string => Boolean(k)),
    photos.map((p: (typeof photos)[number]) => p.id),
  );

  const usedByClient = new Map<string, bigint>();
  for (const p of photos) {
    // If the file is still referenced by another Photo row *and* it has
    // an `r2Key`, skip it: the storage is genuinely not freed.
    if (p.r2Key && !orphaned.has(p.r2Key)) continue;
    const cid = p.gallery.event.clientId;
    const bytes = p.fileSize ?? BigInt(0);
    if (bytes <= BigInt(0)) continue;
    usedByClient.set(cid, (usedByClient.get(cid) ?? BigInt(0)) + bytes);
  }
  return usedByClient;
}

/**
 * Collect storage-deletion payloads for every Photo matching `whereCriteria`.
 *
 * **Must be called BEFORE the parent entity is deleted from the DB**: once
 * `Event` / `Gallery` / `Client` is removed Postgres cascades through the
 * `Photo` rows, so the `findMany` here would return zero results and the
 * R2 / Cloudinary objects would be orphaned.
 *
 * Cross-gallery dedup (PR #76 / issue #10) means more than one Photo row
 * may share an `r2Key` — typically when a client uploads the same file
 * to two galleries. In that case deleting one row must NOT delete the
 * underlying R2 object. We therefore strip `r2Key` (and `thumbnailUrl`,
 * which follows the same lifecycle in dedup mode) from any payload whose
 * key is still referenced by another Photo outside the delete batch.
 * The remaining payloads are filtered out so the caller never enqueues a
 * no-op storage delete.
 *
 * The output is safe to keep across an `await` boundary; pass it to
 * {@link enqueueDeletionWithOutbox} after the transaction commits.
 */
export async function collectPhotoDeletionPayloads(
  whereCriteria: Prisma.PhotoWhereInput,
): Promise<PhotoDeletionPayload[]> {
  const photos = await prisma.photo.findMany({
    where: whereCriteria,
    select: {
      id: true,
      r2Key: true,
      thumbnailUrl: true,
      storageAccountId: true,
      fileSize: true,
      // Review #73-2 (Gemini): pull the owning client through the
      // existing Photo→Gallery→Event relation so callers can compute
      // their per-client `usedStorage` decrement straight from the
      // payload list instead of issuing a redundant `findMany`.
      gallery: {
        select: {
          event: { select: { clientId: true } },
        },
      },
    },
  });

  if (photos.length === 0) return [];

  // Compute orphan-after-delete keys so we don't enqueue R2 deletes for
  // files that another Photo row still references (cross-gallery dedup).
  const orphanedR2Keys = await getOrphanedR2Keys(
    photos
      .map((p: (typeof photos)[number]) => p.r2Key)
      .filter((k: string | null): k is string => Boolean(k)),
    photos.map((p: (typeof photos)[number]) => p.id),
  );

  // Resolve Cloudinary credentials per storage account in one round-trip.
  const uniqueStorageAccountIds = Array.from(
    new Set(photos.map((p: (typeof photos)[number]) => p.storageAccountId).filter(Boolean) as string[]),
  );
  const storageAccounts = uniqueStorageAccountIds.length
    ? await prisma.storageAccount.findMany({
        where: { id: { in: uniqueStorageAccountIds } },
        // Only select fields the deletion payload actually needs.
        // Avoids pulling rotation/secondary secrets and other sensitive
        // columns into Node memory just to build a Cloudinary creds map.
        select: {
          id: true,
          cloudName: true,
          apiKey: true,
          apiSecret: true,
        },
      })
    : [];
  const cloudinaryCredentialsMap = new Map<
    string,
    { cloudName: string | null; apiKey: string | null; apiSecret: string | null } | null
  >();
  for (const account of storageAccounts) {
    cloudinaryCredentialsMap.set(account.id, {
      cloudName: account.cloudName,
      apiKey: account.apiKey,
      apiSecret: account.apiSecret,
    });
  }

  // Fall back to the default active Cloudinary account when the storage
  // account has no credentials of its own (e.g. R2-only accounts).
  const defaultCloudinaryAccount = await prisma.storageAccount.findFirst({
    where: { provider: 'CLOUDINARY', isActive: true },
    orderBy: [{ isDefault: 'desc' }, { priority: 'asc' }],
    // Only the Cloudinary credentials are consumed below; do not load
    // R2 / secondary / rotation columns we don't need here.
    select: {
      cloudName: true,
      apiKey: true,
      apiSecret: true,
    },
  });
  const defaultCloudinaryCredentials = defaultCloudinaryAccount
    ? {
        cloudName: defaultCloudinaryAccount.cloudName,
        apiKey: defaultCloudinaryAccount.apiKey,
        apiSecret: defaultCloudinaryAccount.apiSecret,
      }
    : null;

  // Note: every photo is mapped — including rows with no `r2Key` /
  // `thumbnailUrl` (legacy / failed-upload). The filtering for jobs
  // that actually have storage to clean up moved to
  // `enqueueDeletionWithOutbox` so callers can iterate the full list
  // for `usedStorage` accounting (a row that never hit R2 still ate
  // quota at upload time).
  return photos.map<PhotoDeletionPayload>((photo: (typeof photos)[number]) => {
    let cloudinaryCredentials = defaultCloudinaryCredentials;
    if (photo.storageAccountId && cloudinaryCredentialsMap.has(photo.storageAccountId)) {
      const accountCreds = cloudinaryCredentialsMap.get(photo.storageAccountId);
      if (accountCreds && accountCreds.cloudName && accountCreds.apiKey) {
        cloudinaryCredentials = accountCreds;
      }
    }
    // PR #75 (cross-gallery dedup): if the r2Key is still referenced by
    // another Photo row, null out `r2Key` / `thumbnailUrl` so the
    // worker doesn't accidentally delete a file that another gallery
    // still pins. The accompanying Cloudinary `publicId` follows the
    // same lifecycle in dedup mode. `enqueueDeletionWithOutbox` will
    // then skip enqueueing this row (no storage to clean up).
    const isShared =
      photo.r2Key !== null && photo.r2Key !== undefined && !orphanedR2Keys.has(photo.r2Key);
    return {
      photoId: photo.id,
      // Review #73-2: carry the owning client so callers can hand the
      // payload list to `aggregateUsedBytesByClient` for `usedStorage`
      // accounting without re-issuing a `findMany`.
      clientId: photo.gallery?.event?.clientId ?? null,
      r2Key: isShared ? null : photo.r2Key,
      thumbnailUrl: isShared ? null : photo.thumbnailUrl,
      storageAccountId: photo.storageAccountId,
      fileSize: photo.fileSize?.toString(),
      cloudinaryCredentials,
    };
  });
}

/**
 * Enqueue storage-deletion jobs with an outbox fallback.
 *
 * The transaction that owns the DB rows has already committed at this
 * point, so a queue failure cannot be rolled back — instead we persist
 * a single `FailedJob` row with `status='pending'` and the full payload,
 * which surfaces to admins via `/admin/failed-jobs` and can be retried
 * later. This way:
 *
 *  - The user-facing delete still succeeds (no 500 just because Cloudflare
 *    Queue had a hiccup).
 *  - The R2 / Cloudinary cleanup is recoverable instead of silently lost.
 *
 * Returns `{ queued, outboxed }` so callers can log a precise outcome.
 */
export async function enqueueDeletionWithOutbox(
  payloads: PhotoDeletionPayload[],
): Promise<{ queued: number; outboxed: number; outboxJobId?: string }> {
  // Filter to rows that actually carry storage to clean up. The full
  // payload list (including no-storage rows) is still useful to the
  // caller for `usedStorage` accounting, but enqueueing them here
  // would just spam the worker with no-ops.
  const enqueueable = payloads.filter((p) => p.r2Key || p.thumbnailUrl);
  if (enqueueable.length === 0) return { queued: 0, outboxed: 0 };

  if (!isQueueConfigured()) {
    // Without a queue configured we can't push jobs; record the payload to
    // the outbox so the storage cleanup is still discoverable when an
    // operator wires the queue up.
    const outboxJobId = await recordFailedJob({
      jobType: 'storage-deletion',
      // Review #73-1: redact `apiSecret` before persisting; secrets
      // can be rehydrated from `StorageAccount` on retry.
      payload: { photos: redactPayloadsForOutbox(enqueueable) },
      errorMessage: 'Cloudflare Queue not configured (CLOUDFLARE_ACCOUNT_ID / NEXT_SERVER_CF_QUEUE_TOKEN missing)',
    }).catch(() => undefined);
    return { queued: 0, outboxed: enqueueable.length, outboxJobId };
  }

  try {
    const result = await queueStorageDeletionBulk(enqueueable);
    if (result.success) {
      return { queued: enqueueable.length, outboxed: 0 };
    }
    // Partial success is treated as a soft outbox: we don't know exactly
    // which messages made it through (the helper aggregates on failure),
    // so we record the whole batch and let the manual retry path
    // re-publish — `queueStorageDeletion` itself is idempotent for the
    // worker because it keys by `photoId`.
    const outboxJobId = await recordFailedJob({
      jobType: 'storage-deletion',
      payload: { photos: redactPayloadsForOutbox(enqueueable) },
      errorMessage: result.error || `Queue publish failed (${result.failedCount ?? '?'} jobs)`,
    }).catch(() => undefined);
    return { queued: 0, outboxed: enqueueable.length, outboxJobId };
  } catch (cfError) {
    logQueueError('Bulk deletion queue error', cfError, { photoCount: enqueueable.length });
    const outboxJobId = await recordFailedJob({
      jobType: 'storage-deletion',
      payload: { photos: redactPayloadsForOutbox(enqueueable) },
      errorMessage: cfError instanceof Error ? cfError.message : String(cfError),
    }).catch(() => undefined);
    return { queued: 0, outboxed: enqueueable.length, outboxJobId };
  }
}