import { prisma } from '@/lib/db';
import type { PhotoDeletionPayload } from '@/lib/cloudflare-queue';
import { Prisma } from '@/generated/prisma';

/**
 * Builds a map of StorageAccount counter decrements from deletion payloads.
 *
 * Honors cross-gallery deduplication: photos with r2Key=null (shared/deduped
 * files) do not contribute to disk-usage decrements because the underlying
 * R2 object is still referenced by another row outside this delete batch.
 */
export function buildStorageDecrements(
  deletionPayloads: PhotoDeletionPayload[]
): Map<string, { usedStorage: bigint; totalPhotos: number }> {
  const storageUpdates = new Map<string, { usedStorage: bigint; totalPhotos: number }>();
  for (const p of deletionPayloads) {
    if (!p.storageAccountId) continue;
    const current = storageUpdates.get(p.storageAccountId) ?? {
      usedStorage: BigInt(0),
      totalPhotos: 0,
    };
    const size = p.r2Key && p.fileSize ? BigInt(p.fileSize) : BigInt(0);
    storageUpdates.set(p.storageAccountId, {
      usedStorage: current.usedStorage + size,
      totalPhotos: current.totalPhotos + 1,
    });
  }
  return storageUpdates;
}

/**
 * Returns Prisma update operations for decrementing StorageAccount counters.
 *
 * Designed to be spread into prisma.$transaction([...storageDecrementOps(map), otherOp])
 * so the counter updates and the delete are atomic.
 */
export function storageDecrementOps(
  storageUpdates: Map<string, { usedStorage: bigint; totalPhotos: number }>
): Prisma.PrismaPromise<unknown>[] {
  return Array.from(storageUpdates.entries()).map(([accountId, delta]) =>
    prisma.storageAccount.update({
      where: { id: accountId },
      data: {
        usedStorage: { decrement: delta.usedStorage },
        totalPhotos: { decrement: delta.totalPhotos },
      },
    })
  );
}
