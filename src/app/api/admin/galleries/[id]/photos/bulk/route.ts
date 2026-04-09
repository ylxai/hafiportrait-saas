import { prisma } from '@/lib/db';
import { successResponse, serverErrorResponse, errorResponse } from '@/lib/api/response';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';
import { queueStorageDeletionBulk, isQueueConfigured } from '@/lib/cloudflare-queue';

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
    const { photoIds } = body;

    if (!Array.isArray(photoIds) || photoIds.length === 0) {
      return errorResponse('No photos selected for deletion', 400);
    }

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

    // Get default cloudinary account if needed
    const defaultCloudinaryAccount = await prisma.storageAccount.findFirst({
      where: { 
        provider: 'CLOUDINARY',
        isActive: true,
      },
      orderBy: [{ isDefault: 'desc' }, { priority: 'asc' }],
    });

    const cloudinaryCredentials = defaultCloudinaryAccount ? {
      cloudName: defaultCloudinaryAccount.cloudName,
      apiKey: defaultCloudinaryAccount.apiKey,
      apiSecret: defaultCloudinaryAccount.apiSecret,
    } : null;

    // Prepare jobs for queues
    const deletionJobs = [];

    for (const photo of photos) {
      if (photo.r2Key || photo.thumbnailUrl) {
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
