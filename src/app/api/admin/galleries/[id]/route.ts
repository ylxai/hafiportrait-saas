import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { successResponse, notFoundResponse, serverErrorResponse, errorResponse } from '@/lib/api/response';
import { updateGallerySchema } from '@/lib/api/validation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';
import { getDefaultAccount } from '@/lib/storage/accounts';
import { getCloudinaryThumbnailUrl } from '@/lib/cloudinary';

async function checkAuth() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return errorResponse('Unauthorized', 401);
  }
  return session;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await checkAuth();
    if (auth instanceof NextResponse) return auth;

    const { id } = await params;

    const gallery = await prisma.gallery.findUnique({
      where: { id },
      include: {
        event: {
          include: {
            client: true,
          },
        },
        photos: {
          orderBy: { order: 'asc' },
        },
        selections: {
          orderBy: { submittedAt: 'desc' },
          include: {
            photos: true,
          },
        },
      },
    });

    if (!gallery) {
      return notFoundResponse('Gallery not found');
    }

    const cloudinaryAccount = await getDefaultAccount('CLOUDINARY');
    const cloudName = cloudinaryAccount?.cloudName || process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;

    // Serialize BigInt fields for JSON
    const serializedGallery = {
      ...gallery,
      photos: gallery.photos.map(photo => {
        let thumbnailUrl = photo.thumbnailUrl;
        if (!thumbnailUrl && cloudName) {
          thumbnailUrl = getCloudinaryThumbnailUrl(photo.url, { width: 400, cloudName });
        }
        return {
          ...photo,
          thumbnailUrl: thumbnailUrl || photo.url,
          fileSize: photo.fileSize?.toString() || null,
        };
      }),
    };

    return successResponse({ gallery: serializedGallery });
  } catch (error) {
    console.error('Error fetching gallery:', error);
    return serverErrorResponse('Failed to fetch gallery');
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await checkAuth();
    if (auth instanceof NextResponse) return auth;

    const { id } = await params;
    const body = await request.json();
    const validated = updateGallerySchema.parse(body);

    const gallery = await prisma.gallery.update({
      where: { id },
      data: validated,
    });

    return successResponse({ gallery });
  } catch (error) {
    console.error('Error updating gallery:', error);
    return serverErrorResponse('Failed to update gallery');
  }
}