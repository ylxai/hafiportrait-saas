import { prisma } from '@/lib/db';
import { successResponse, serverErrorResponse, errorResponse } from '@/lib/api/response';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';
import { queueStorageDeletionBulk, isQueueConfigured } from '@/lib/cloudflare-queue';
import { z } from 'zod';
import { validateRequest } from '@/lib/api/validation';

const bulkDeleteSchema = z.object({
  photoIds: z.array(z.string()).min(1, 'At least one photo ID required'),
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
    const body = await request.json();
    
    // Validate payload
    const validation = validateRequest(bulkDeleteSchema, body);
    if (!validation.success) {
      return errorResponse(validation.error, 400);
    }

    const { photoIds } = validation.data;

    // Get photos with storage accounts
    const photos = await prisma.photo.findMany({
      where: { 
        id: { in: photoIds },
        galleryId: galleryId
      },
      include: {
        storageAccount: true,
      },
    });

    if (photos.length === 0) {
      return errorResponse('Photos not found or unauthorized', 404);
    }

    // Mengumpulkan semua storageAccountId unik dari foto-foto yang akan dihapus
    const uniqueStorageAccountIds = Array.from(new Set(photos.map(p => p.storageAccountId).filter(Boolean))) as string[];

    // Mengambil semua akun penyimpanan yang relevan dalam satu query
    const storageAccounts = await prisma.storageAccount.findMany({
      where: { id: { in: uniqueStorageAccountIds } }
    });

    // Membuat map dari storageAccountId ke kredensial Cloudinary yang sesuai
    const cloudinaryCredentialsMap = new Map<string, { cloudName: string | null; apiKey: string | null; apiSecret: string | null } | null>();
    
    storageAccounts.forEach(account => {
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

    // Prepare jobs for queues
    const deletionJobs = [];

    for (const photo of photos) {
      if (photo.r2Key || photo.thumbnailUrl) {
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
          r2Key: photo.r2Key,
          thumbnailUrl: photo.thumbnailUrl,
          storageAccountId: photo.storageAccountId,
          fileSize: photo.fileSize?.toString(),
          cloudinaryCredentials,
        });
      }
    }

    if (deletionJobs.length > 0) {
      if (isQueueConfigured()) {
        try {
          const result = await queueStorageDeletionBulk(deletionJobs);
          if (result.success) {
            console.log(`[Delete] Queued ${deletionJobs.length} deletions to Cloudflare Queue`);
          } else {
            console.error(`[Delete] Cloudflare Queue bulk error:`, result.error);
          }
        } catch (cfError) {
          console.error(`[Delete] Cloudflare Queue bulk error:`, cfError);
        }
      } else {
        console.warn(`[Delete] Cloudflare Queue not configured. Storage cleanup skipped for ${deletionJobs.length} photos`);
      }
    }

    // Delete all from database immediately
    await prisma.photo.deleteMany({
      where: { 
        id: { in: photos.map(p => p.id) },
        galleryId: galleryId
      },
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
