import { prisma } from '@/lib/db';
import { successResponse, notFoundResponse, serverErrorResponse, errorResponse } from '@/lib/api/response';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';
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
          if (result.success) {
            console.log(`[Delete] Queued to Cloudflare for photo ${photoId}`);
          } else {
            console.error(`[Delete] Cloudflare Queue failed: ${result.error}`);
          }
        } catch (cfError) {
          console.error(`[Delete] Cloudflare Queue error:`, cfError);
        }
      } else {
        console.warn('[Delete] Cloudflare Queue not configured. Storage will not be cleaned up.');
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
