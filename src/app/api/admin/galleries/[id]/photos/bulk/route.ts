import { prisma } from '@/lib/db';
import { successResponse, serverErrorResponse, errorResponse } from '@/lib/api/response';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';
import { deletionQueue } from '@/lib/queue';
import { queueStorageDeletion, isQueueConfigured } from '@/lib/cloudflare-queue';

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
    const bullMQJobs = [];

    for (const photo of photos) {
      if (photo.r2Key || photo.thumbnailUrl) {
        const deletionData = {
          photoId: photo.id,
          r2Key: photo.r2Key,
          thumbnailUrl: photo.thumbnailUrl,
          storageAccountId: photo.storageAccountId,
          fileSize: photo.fileSize ? Number(photo.fileSize) : undefined,
          cloudinaryCredentials,
        };

        // Try Cloudflare Queue first
        if (isQueueConfigured()) {
          try {
            await queueStorageDeletion(deletionData);
          } catch (cfError) {
            console.error(`[Delete] Cloudflare Queue error for ${photo.id}:`, cfError);
          }
        }

        // Always add to BullMQ array for fallback/local
        bullMQJobs.push({
          name: 'delete-photo',
          data: {
            photoId: photo.id,
            r2Key: photo.r2Key,
            thumbnailUrl: photo.thumbnailUrl,
            storageAccountId: photo.storageAccountId,
            fileSize: photo.fileSize?.toString(),
            cloudinaryCredentials,
          },
          opts: {
            attempts: 3,
            backoff: { type: 'exponential', delay: 2000 },
          }
        });
      }
    }

    // Add all to BullMQ in bulk
    if (bullMQJobs.length > 0) {
      try {
        await deletionQueue.addBulk(bullMQJobs as unknown as Parameters<typeof deletionQueue.addBulk>[0]);
        console.log(`[Delete] Queued ${bullMQJobs.length} bulk deletions to BullMQ`);
      } catch (bullMQError) {
        console.error(`[Delete] BullMQ bulk add failed:`, bullMQError);
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
