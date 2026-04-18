import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { successResponse, unauthorizedResponse, handlePrismaError, validationError, errorResponse } from '@/lib/api/response';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';
import { z } from 'zod';
import { queueStorageDeletionBulk } from '@/lib/cloudflare-queue';
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

    const body: unknown = await request.json();
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

    // Step 2: Prepare deletion jobs
    const deletionJobs = photos
      .filter(photo => photo.r2Key || photo.thumbnailUrl)
      .map(photo => {
        const cloudinaryCredentials = photo.cloudinaryAccount || photo.storageAccount;
        
        return {
          photoId: photo.id,
          r2Key: photo.r2Key || undefined,
          thumbnailUrl: photo.thumbnailUrl || undefined,
          fileSize: photo.fileSize ? photo.fileSize.toString() : undefined,
          storageAccountId: photo.storageAccountId || undefined,
          cloudinaryCredentials: cloudinaryCredentials ? {
            cloudName: cloudinaryCredentials.cloudName,
            apiKey: cloudinaryCredentials.apiKey,
            apiSecret: cloudinaryCredentials.apiSecret,
          } : undefined,
        };
      });

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

    // Step 4: Only delete from database AFTER successful queue
    try {
      await prisma.photo.deleteMany({
        where: { id: { in: photoIds } },
      });

      console.log(`[Bulk Delete] Successfully deleted ${photos.length} photos from database`);

      return successResponse({
        deleted: photos.length,
        photoIds: photos.map(p => p.id),
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