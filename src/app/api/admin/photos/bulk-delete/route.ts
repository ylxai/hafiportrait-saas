import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { successResponse, unauthorizedResponse, handlePrismaError, validationError, errorResponse } from '@/lib/api/response';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';
import { z } from 'zod';
import { getOrphanedR2Keys, queueStorageDeletionBulk } from '@/lib/cloudflare-queue';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';

const bulkDeleteSchema = z.object({
  photoIds: z.array(z.string()).min(1).max(100),
});

async function checkAuth() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return unauthorizedResponse();
  }
  return session;
}

/**
 * Bulk delete photos with atomic queue-first pattern
 * 
 * Flow:
 * 1. Fetch photos with storage credentials
 * 2. Queue storage deletion jobs (with retry)
 * 3. If queue succeeds, delete from database
 * 4. If queue fails, return error without deleting from DB
 * 
 * This prevents orphaned files in storage.
 */
export async function POST(request: Request) {
  try {
    const auth = await checkAuth();
    if (auth instanceof NextResponse) return auth;

    // Rate limiting
    const rateLimit = await checkRateLimit(auth.user.email, RATE_LIMITS.BULK_DELETE);
    if (!rateLimit.success) {
      return errorResponse('Too many requests. Please try again later.', 429);
    }

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

    // Step 1: Get photos with storage credentials
    const photos = await prisma.photo.findMany({
      where: { id: { in: photoIds } },
      select: {
        id: true,
        r2Key: true,
        publicId: true,
        thumbnailUrl: true,
        fileSize: true,
        galleryId: true,
        storageAccountId: true,
        cloudinaryAccountId: true,
        // Review fix #2: butuh clientId untuk decrement Client.usedStorage
        gallery: { select: { event: { select: { clientId: true } } } },
        storageAccount: {
          select: {
            cloudName: true,
            apiKey: true,
            apiSecret: true,
          },
        },
        cloudinaryAccount: {
          select: {
            cloudName: true,
            apiKey: true,
            apiSecret: true,
          },
        },
      },
    });

    if (photos.length === 0) {
      return errorResponse('No photos found', 404);
    }

    // PR #76 / issue #10 — drop r2Key/thumbnailUrl from any payload whose
    // file is still referenced by another Photo row (cross-gallery dedup).
    // The set of orphan r2Keys also drives the per-client usedStorage
    // decrement below so we only release bytes that are genuinely freed.
    const orphanedR2Keys = await getOrphanedR2Keys(
      photos.map((p: typeof photos[number]) => p.r2Key).filter((k: string | null): k is string => Boolean(k)),
      photos.map((p: typeof photos[number]) => p.id),
    );

    // Step 2: Prepare deletion jobs
    const deletionJobs = photos
      .map((photo: typeof photos[number]) => {
        const cloudinaryCredentials = photo.cloudinaryAccount || photo.storageAccount;
        const isShared = photo.r2Key !== null && !orphanedR2Keys.has(photo.r2Key);

        return {
          photoId: photo.id,
          // Strip storage refs when shared so the worker has nothing to do.
          r2Key: isShared ? undefined : (photo.r2Key || undefined),
          thumbnailUrl: isShared ? undefined : (photo.thumbnailUrl || undefined),
          fileSize: photo.fileSize ? photo.fileSize.toString() : undefined,
          storageAccountId: photo.storageAccountId || undefined,
          cloudinaryCredentials: cloudinaryCredentials ? {
            cloudName: cloudinaryCredentials.cloudName,
            apiKey: cloudinaryCredentials.apiKey,
            apiSecret: cloudinaryCredentials.apiSecret,
          } : undefined,
        };
      })
      .filter((job: { r2Key?: string; thumbnailUrl?: string }) => job.r2Key || job.thumbnailUrl);

    // Step 3: Queue storage deletion FIRST (with retry logic built-in)
    if (deletionJobs.length > 0) {
      const queueResult = await queueStorageDeletionBulk(deletionJobs);
      
      if (!queueResult.success) {
        // Queue failed - DO NOT delete from database
        console.error('[Bulk Delete] Queue failed, aborting database deletion:', queueResult.error);
        return errorResponse(
          `Failed to queue storage deletion: ${queueResult.error}. Photos were NOT deleted from database to prevent orphaned files.`,
          500
        );
      }

      // Log partial failures
      if (queueResult.failedCount && queueResult.failedCount > 0) {
        console.warn(`[Bulk Delete] ${queueResult.failedCount} deletion jobs failed to queue`);
      }

      console.log(`[Bulk Delete] Successfully queued ${deletionJobs.length} storage deletion jobs`);
    }

    // Step 4: Only delete from database AFTER successful queue.
    // Review fix #2: aggregate decrement Client.usedStorage in same transaction.
    // PR #76 / issue #10: only decrement bytes for photos whose r2Key
    // becomes orphan after the delete — shared r2Keys (cross-gallery
    // dedup) keep the file alive and therefore consume no new quota.
    const sumByClient = new Map<string, bigint>();
    for (const p of photos) {
      const cId = p.gallery?.event?.clientId;
      if (!cId || !p.fileSize) continue;
      // A photo with no `r2Key` (legacy / failed upload) effectively
      // has no storage to keep alive, so it counts as orphan.
      if (p.r2Key !== null && !orphanedR2Keys.has(p.r2Key)) continue;
      sumByClient.set(cId, (sumByClient.get(cId) ?? BigInt(0)) + p.fileSize);
    }
    try {
      await prisma.$transaction(async (tx) => {
        await tx.photo.deleteMany({ where: { id: { in: photoIds } } });
        for (const [cId, sum] of sumByClient) {
          if (sum > BigInt(0)) {
            await tx.client.update({
              where: { id: cId },
              data: { usedStorage: { decrement: sum } },
            });
          }
        }
      });

      console.log(`[Bulk Delete] Successfully deleted ${photos.length} photos from database`);

      return successResponse({
        deleted: photos.length,
        photoIds: photos.map((p: typeof photos[number]) => p.id),
        queuedForStorageDeletion: deletionJobs.length,
      });
    } catch (dbError) {
      // Database deletion failed AFTER queue succeeded
      // This is a critical error - files will be deleted from storage but DB records remain
      console.error('[Bulk Delete] CRITICAL: Database deletion failed after queue succeeded:', dbError);
      
      // Log this for manual intervention
      console.error('[Bulk Delete] Manual intervention required for photo IDs:', photoIds);
      
      return errorResponse(
        'Database deletion failed. Storage deletion was queued successfully. Manual intervention may be required.',
        500
      );
    }
  } catch (error) {
    console.error('[API] Error bulk deleting photos:', error);
    return handlePrismaError(error);
  }
}