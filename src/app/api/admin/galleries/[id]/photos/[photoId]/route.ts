import { prisma } from '@/lib/db';
import { successResponse, notFoundResponse, serverErrorResponse, errorResponse } from '@/lib/api/response';
import { NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/auth/require-admin-auth';
import { getOrphanedR2Keys, queueStorageDeletion, isQueueConfigured } from '@/lib/cloudflare-queue';
import { z } from 'zod';
import { withRequestContext } from '@/lib/with-request-context';

// Helper to check Prisma error codes
function isPrismaError(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === code;
}

// Zod schema for route params
const paramsSchema = z.object({
  id: z.string().min(1, 'Gallery ID is required'),
  photoId: z.string().min(1, 'Photo ID is required'),
});

export const DELETE = withRequestContext(async (
  request: Request,
  { params }: { params: Promise<{ id: string; photoId: string }> }
) => {
  try {
    const auth = await requireAdminAuth();
    if (auth instanceof NextResponse) return auth;

    const resolvedParams = await params;
    
    // Validate route params
    const validation = paramsSchema.safeParse(resolvedParams);
    if (!validation.success) {
      const firstError = validation.error.errors[0];
      return errorResponse(`${firstError.path.join('.')}: ${firstError.message}`, 400);
    }

    const { photoId } = validation.data;

    // Get photo dengan storage account (untuk credentials) + clientId untuk decrement quota
    const photo = await prisma.photo.findUnique({
      where: { id: photoId },
      include: {
        storageAccount: true,
        gallery: { select: { event: { select: { clientId: true } } } },
      },
    });

    if (!photo) {
      return notFoundResponse('Photo not found');
    }

    // PR #76 / issue #10 — cross-gallery dedup awareness.
    // If another Photo row still references this `r2Key` (because the
    // file was reused at upload time for a different gallery owned by
    // the same client) we must NOT delete the R2 object here. Same
    // logic for the `Client.usedStorage` decrement: bytes are only
    // freed when the last reference disappears.
    //
    // Review #75-2 (CodeAnt): a photo with `r2Key=null` (legacy / failed
    // upload) effectively has no storage to keep alive, so it counts as
    // orphan for both the queue gate and the quota decrement — matching
    // what `bulk-delete/route.ts` and `actions/events.ts` already do via
    // `computeUsedStorageDeltaForDeletion`. Without this branch the
    // single-photo path would silently leak quota for legacy rows.
    const orphanedR2Keys = photo.r2Key
      ? await getOrphanedR2Keys([photo.r2Key], [photo.id])
      : new Set<string>();
    const isR2Orphan = !photo.r2Key || orphanedR2Keys.has(photo.r2Key);

    // Queue storage deletion for background processing — but only when
    // this row holds the last reference to the R2 object.
    if (isR2Orphan && (photo.r2Key || photo.thumbnailUrl)) {
      // Get Cloudinary credentials dari storage account
      // (untuk deletion dari Cloudinary)
      let cloudinaryCredentials = null;
      if (photo.storageAccountId) {
        const cloudinaryAccount = await prisma.storageAccount.findUnique({
          where: { id: photo.storageAccountId }
        });
        
        if (cloudinaryAccount && cloudinaryAccount.cloudName && cloudinaryAccount.apiKey) {
          cloudinaryCredentials = {
            cloudName: cloudinaryAccount.cloudName,
            apiKey: cloudinaryAccount.apiKey,
            apiSecret: cloudinaryAccount.apiSecret,
          };
        }
      }

      // Fallback ke default account
      if (!cloudinaryCredentials) {
        const defaultCloudinaryAccount = await prisma.storageAccount.findFirst({
          where: { 
            provider: 'CLOUDINARY',
            isActive: true,
          },
          orderBy: [{ isDefault: 'desc' }, { priority: 'asc' }],
        });
        
        if (defaultCloudinaryAccount) {
          cloudinaryCredentials = {
            cloudName: defaultCloudinaryAccount.cloudName,
            apiKey: defaultCloudinaryAccount.apiKey,
            apiSecret: defaultCloudinaryAccount.apiSecret,
          };
        }
      }

      const deletionData = {
        photoId: photo.id,
        r2Key: photo.r2Key,
        thumbnailUrl: photo.thumbnailUrl,
        storageAccountId: photo.storageAccountId,
        fileSize: photo.fileSize ? photo.fileSize.toString() : undefined,
        // Include Cloudinary credentials untuk Workers
        cloudinaryCredentials,
      };

      if (isQueueConfigured()) {
        try {
          const result = await queueStorageDeletion(deletionData);
          if (!result.success) {
            console.error(`[Delete] Cloudflare Queue failed: ${result.error}`);
            return errorResponse('Failed to queue storage deletion', 500);
          }
          console.log(`[Delete] Queued to Cloudflare for photo ${photoId}`);
        } catch (cfError) {
          console.error(`[Delete] Cloudflare Queue error:`, cfError);
          return errorResponse('Failed to queue storage deletion', 500);
        }
      } else {
        console.warn('[Delete] Cloudflare Queue not configured. Storage will not be cleaned up.');
      }
    }

    // Hapus dari database setelah queue berhasil.
    // Review fix #2: decrement Client.usedStorage atomically supaya quota gate
    // (CRITICAL FIX #5) tidak salah menolak upload setelah foto dihapus.
    // PR #76: only decrement when this delete frees real bytes — i.e. the
    // r2Key has no other Photo referencing it after the delete.
    const clientId = photo.gallery?.event?.clientId;
    const fileSize = photo.fileSize ?? BigInt(0);
    const decrementBytes = isR2Orphan ? fileSize : BigInt(0);
    await prisma.$transaction(async (tx) => {
      await tx.photo.delete({ where: { id: photoId } });
      if (clientId && decrementBytes > BigInt(0)) {
        try {
          await tx.client.update({
            where: { id: clientId },
            data: { 
              usedStorage: { decrement: decrementBytes },
              photoCount: { decrement: 1 },
            },
          });
        } catch (error) {
          // Handle 'record not found' gracefully (concurrent deletion)
          if (isPrismaError(error, 'P2025')) {
            // Client was deleted, skip quota update
          } else {
            throw error;
          }
        }
      } else if (clientId) {
        // Dedup case: decrement photoCount only (no storage freed)
        try {
          await tx.client.update({
            where: { id: clientId },
            data: { photoCount: { decrement: 1 } },
          });
        } catch (error) {
          // Handle 'record not found' gracefully (concurrent deletion)
          if (isPrismaError(error, 'P2025')) {
            // Client was deleted, skip quota update
          } else {
            throw error;
          }
        }
      }
    });

    return successResponse({ 
      success: true,
      message: 'Photo deleted from database. Storage cleanup queued.',
    });
  } catch (error) {
    console.error('Error deleting photo:', error);
    return serverErrorResponse('Failed to delete photo');
  }
});
