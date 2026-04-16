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

export async function POST(request: Request) {
  try {
    const auth = await checkAuth();
    if (auth instanceof NextResponse) return auth;

    // Rate limiting
    const rateLimit = await checkRateLimit(auth.user.email, RATE_LIMITS.BULK_DELETE);
    if (!rateLimit.success) {
      return errorResponse('Too many requests. Please try again later.', 429);
    }

    const body = await request.json();
    const result = bulkDeleteSchema.safeParse(body);
    
    if (!result.success) {
      return validationError(result.error);
    }

    const { photoIds } = result.data;

    // Get photos with storage credentials
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

    // Delete from database
    await prisma.photo.deleteMany({
      where: { id: { in: photoIds } },
    });

    // Queue storage deletion with credentials
    const deletionJobs = photos
      .filter(photo => photo.r2Key || photo.thumbnailUrl)
      .map(photo => {
        const cloudinaryCredentials = photo.cloudinaryAccount || photo.storageAccount;
        
        return {
          photoId: photo.id,
          r2Key: photo.r2Key || undefined,
          thumbnailUrl: photo.thumbnailUrl || undefined,
          fileSize: photo.fileSize?.toString(),
          storageAccountId: photo.storageAccountId || undefined,
          cloudinaryCredentials: cloudinaryCredentials ? {
            cloudName: cloudinaryCredentials.cloudName,
            apiKey: cloudinaryCredentials.apiKey,
            apiSecret: cloudinaryCredentials.apiSecret,
          } : undefined,
        };
      });

    if (deletionJobs.length > 0) {
      await queueStorageDeletionBulk(deletionJobs);
    }

    return successResponse({
      deleted: photos.length,
      photoIds: photos.map(p => p.id),
    });
  } catch (error) {
    console.error('[API] Error bulk deleting photos:', error);
    return handlePrismaError(error);
  }
}
