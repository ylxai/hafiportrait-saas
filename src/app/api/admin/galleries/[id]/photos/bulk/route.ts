import { prisma } from '@/lib/db';
import { successResponse, serverErrorResponse, errorResponse } from '@/lib/api/response';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';
import { getOrphanedR2Keys, queueStorageDeletionBulk, isQueueConfigured } from '@/lib/cloudflare-queue';
import { z } from 'zod';
import { validateRequest } from '@/lib/api/validation';
import { Prisma } from '@/generated/prisma';

const bulkDeleteSchema = z.object({
  photoIds: z.array(z.string().trim().min(1, 'Invalid photo ID')).min(1, 'Select at least 1 photo').max(100, 'Maximum 100 photos per batch'),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return errorResponse('Unauthorized', 401);
    }

    const { id: galleryId } = await params;
    const body: unknown = await request.json();
    
    // Validate payload
    const validation = validateRequest(bulkDeleteSchema, body);
    if (!validation.success) {
      return errorResponse(validation.error, 400);
    }

    const { photoIds } = validation.data;

    // Get photos with storage accounts + clientId untuk decrement quota (review fix #2)
    const photos = await prisma.photo.findMany({
      where: { 
        id: { in: photoIds },
        galleryId: galleryId
      },
      include: {
        storageAccount: true,
        gallery: { select: { event: { select: { clientId: true } } } },
      },
    });

    if (photos.length === 0) {
      return errorResponse('Photos not found or unauthorized', 404);
    }

    // PR #76 / issue #10 — cross-gallery dedup awareness. Compute the set
    // of r2Keys that genuinely become orphan after this delete; we'll
    // skip both the R2 enqueue and the usedStorage decrement for any
    // r2Key still referenced by a Photo row outside the delete batch.
    const orphanedR2Keys = await getOrphanedR2Keys(
      photos.map((p: typeof photos[number]) => p.r2Key).filter((k: string | null): k is string => Boolean(k)),
      photos.map((p: typeof photos[number]) => p.id),
    );

    // Mengumpulkan semua storageAccountId unik dari foto-foto yang akan dihapus
    const uniqueStorageAccountIds = Array.from(new Set(photos.map((p: typeof photos[number]) => p.storageAccountId).filter(Boolean))) as string[];

    // Mengambil semua akun penyimpanan yang relevan dalam satu query
    const storageAccounts = await prisma.storageAccount.findMany({
      where: { id: { in: uniqueStorageAccountIds } }
    });

    // Membuat map dari storageAccountId ke kredensial Cloudinary yang sesuai
    const cloudinaryCredentialsMap = new Map<string, { cloudName: string | null; apiKey: string | null; apiSecret: string | null } | null>();
    
    storageAccounts.forEach((account: typeof storageAccounts[number]) => {
      cloudinaryCredentialsMap.set(account.id, {
        cloudName: account.cloudName,
        apiKey: account.apiKey,
        apiSecret: account.apiSecret,
      });
    });

    // Ambil default cloudinary account sebagai fallback jika storage account tidak memilikinya
    const defaultCloudinaryAccount = await prisma.storageAccount.findFirst({
      where: { provider: 'CLOUDINARY', isActive: true },
      orderBy: [{ isDefault: 'desc' }, { priority: 'asc' }],
    });

    const defaultCloudinaryCredentials = defaultCloudinaryAccount ? {
      cloudName: defaultCloudinaryAccount.cloudName,
      apiKey: defaultCloudinaryAccount.apiKey,
      apiSecret: defaultCloudinaryAccount.apiSecret,
    } : null;

    // Prepare jobs for queues. Photos whose r2Key is still referenced by
    // another row are NOT enqueued — the worker would otherwise delete a
    // file that the surviving Photo row still serves to clients.
    const deletionJobs = [];

    for (const photo of photos) {
      const isShared = photo.r2Key !== null && !orphanedR2Keys.has(photo.r2Key);
      const r2Key = isShared ? null : photo.r2Key;
      const thumbnailUrl = isShared ? null : photo.thumbnailUrl;
      if (!r2Key && !thumbnailUrl) continue;

      // Gunakan kredensial dari map berdasarkan storageAccountId, atau fallback ke default
      let cloudinaryCredentials = defaultCloudinaryCredentials;
      if (photo.storageAccountId && cloudinaryCredentialsMap.has(photo.storageAccountId)) {
        const accountCreds = cloudinaryCredentialsMap.get(photo.storageAccountId);
        if (accountCreds && accountCreds.cloudName && accountCreds.apiKey) {
          cloudinaryCredentials = accountCreds;
        }
      }

      deletionJobs.push({
        photoId: photo.id,
        r2Key,
        thumbnailUrl,
        storageAccountId: photo.storageAccountId,
        fileSize: photo.fileSize?.toString(),
        cloudinaryCredentials,
      });
    }

    if (deletionJobs.length > 0) {
      if (isQueueConfigured()) {
        try {
          const result = await queueStorageDeletionBulk(deletionJobs);
          if (!result.success) {
            console.error(`[Delete] Cloudflare Queue bulk error:`, result.error);
            return errorResponse('Failed to queue storage deletion', 500);
          }
          console.log(`[Delete] Queued ${deletionJobs.length} deletions to Cloudflare Queue`);
        } catch (cfError) {
          console.error(`[Delete] Cloudflare Queue bulk error:`, cfError);
          return errorResponse('Failed to queue storage deletion', 500);
        }
      } else {
        console.warn(`[Delete] Cloudflare Queue not configured. Storage cleanup skipped for ${deletionJobs.length} photos`);
      }
    }

    // Delete all from database setelah queue berhasil.
    // Review fix #2: aggregate decrement per-client untuk Client.usedStorage.
    // PR #76: only decrement bytes for photos whose r2Key becomes orphan
    // — shared keys keep the file (and the consumed bytes) alive.
    const sumByClient = new Map<string, bigint>();
    const countByClient = new Map<string, number>();
    for (const p of photos) {
      const cId = p.gallery?.event?.clientId;
      if (!cId) continue;
      
      // Always count photos
      countByClient.set(cId, (countByClient.get(cId) ?? 0) + 1);
      
      // Only count storage for orphaned files
      if (p.fileSize && (p.r2Key === null || orphanedR2Keys.has(p.r2Key))) {
        sumByClient.set(cId, (sumByClient.get(cId) ?? BigInt(0)) + p.fileSize);
      }
    }
    await prisma.$transaction(async (tx) => {
      await tx.photo.deleteMany({
        where: {
          id: { in: photos.map((p: typeof photos[number]) => p.id) },
          galleryId: galleryId,
        },
      });
      // Unified loop: update storage and count for all clients
      for (const [cId, count] of countByClient) {
        const sum = sumByClient.get(cId) ?? BigInt(0);
        try {
          await tx.client.update({
            where: { id: cId },
            data: {
              usedStorage: { decrement: sum },
              photoCount: { decrement: count },
            },
          });
        } catch (error) {
          // Handle 'record not found' gracefully
          if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
            continue;
          }
          throw error;
        }
      }
    });

    return successResponse({ 
      success: true,
      deleted: photos.length,
      message: `${photos.length} photos deleted from database. Storage cleanup queued.`,
    });
  } catch (error) {
    console.error('Error bulk deleting photos:', error);
    return serverErrorResponse('Failed to bulk delete photos');
  }
}
