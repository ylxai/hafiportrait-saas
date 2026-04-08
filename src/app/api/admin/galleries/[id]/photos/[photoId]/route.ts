import { prisma } from '@/lib/db';
import { successResponse, notFoundResponse, serverErrorResponse, errorResponse } from '@/lib/api/response';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';
import { deletionQueue } from '@/lib/queue';
import { queueStorageDeletion, isQueueConfigured } from '@/lib/cloudflare-queue';

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; photoId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return errorResponse('Unauthorized', 401);
    }

    const { photoId } = await params;

    // Get photo dengan storage account (untuk credentials)
    const photo = await prisma.photo.findUnique({
      where: { id: photoId },
      include: {
        storageAccount: true,
      },
    });

    if (!photo) {
      return notFoundResponse('Photo not found');
    }

    // Queue storage deletion for background processing
    if (photo.r2Key || photo.thumbnailUrl) {
      // Get Cloudinary credentials dari storage account
      // (untuk deletion dari Cloudinary)
      let cloudinaryCredentials = null;
      if (photo.storageAccountId) {
        const cloudinaryAccount = await prisma.storageAccount.findFirst({
          where: { 
            provider: 'CLOUDINARY',
            isActive: true,
          },
          orderBy: [{ isDefault: 'desc' }, { priority: 'asc' }],
        });
        
        if (cloudinaryAccount) {
          cloudinaryCredentials = {
            cloudName: cloudinaryAccount.cloudName,
            apiKey: cloudinaryAccount.apiKey,
            apiSecret: cloudinaryAccount.apiSecret,
          };
        }
      }

      const deletionData = {
        photoId: photo.id,
        r2Key: photo.r2Key,
        thumbnailUrl: photo.thumbnailUrl,
        storageAccountId: photo.storageAccountId,
        fileSize: photo.fileSize ? Number(photo.fileSize) : undefined,
        // Include Cloudinary credentials untuk Workers
        cloudinaryCredentials,
      };

      // Try Cloudflare Queue first (for production on Vercel)
      if (isQueueConfigured()) {
        try {
          const result = await queueStorageDeletion(deletionData);
          if (result.success) {
            console.log(`[Delete] Queued to Cloudflare for photo ${photoId}`);
          } else {
            console.warn(`[Delete] Cloudflare Queue failed, trying BullMQ: ${result.error}`);
          }
        } catch (cfError) {
          console.error(`[Delete] Cloudflare Queue error:`, cfError);
        }
      }
      
      // Fallback to BullMQ (for local development or if Cloudflare fails)
      try {
        await deletionQueue.add('delete-photo', {
          photoId: photo.id,
          r2Key: photo.r2Key,
          thumbnailUrl: photo.thumbnailUrl,
          storageAccountId: photo.storageAccountId,
          fileSize: photo.fileSize?.toString(),
          // Cloudinary credentials untuk BullMQ worker
          cloudinaryCredentials,
        }, {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
        });
        console.log(`[Delete] Queued to BullMQ for photo ${photoId}`);
      } catch (bullMQError) {
        console.error(`[Delete] BullMQ also failed:`, bullMQError);
      }
    }

    // Hapus dari database immediately
    await prisma.photo.delete({
      where: { id: photoId },
    });

    return successResponse({ 
      success: true,
      message: 'Photo deleted from database. Storage cleanup queued.',
    });
  } catch (error) {
    console.error('Error deleting photo:', error);
    return serverErrorResponse('Failed to delete photo');
  }
}
