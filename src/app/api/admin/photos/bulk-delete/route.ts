import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { successResponse, unauthorizedResponse, handlePrismaError, validationError } from '@/lib/api/response';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';
import { z } from 'zod';
import { queueStorageDeletion } from '@/lib/cloudflare-queue';

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

    const body = await request.json();
    const result = bulkDeleteSchema.safeParse(body);
    
    if (!result.success) {
      return validationError(result.error);
    }

    const { photoIds } = result.data;

    // Get photos with storage info
    const photos = await prisma.photo.findMany({
      where: { id: { in: photoIds } },
      select: {
        id: true,
        r2Key: true,
        publicId: true,
        galleryId: true,
      },
    });

    if (photos.length === 0) {
      return validationError({ photoIds: ['No photos found'] });
    }

    // Delete from database
    await prisma.photo.deleteMany({
      where: { id: { in: photoIds } },
    });

    // Queue storage deletion for each photo
    for (const photo of photos) {
      if (photo.r2Key || photo.publicId) {
        await queueStorageDeletion({
          photoId: photo.id,
          r2Key: photo.r2Key || undefined,
          cloudinaryPublicId: photo.publicId || undefined,
        });
      }
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
