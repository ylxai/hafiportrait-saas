import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';
import { prisma } from '@/lib/db';
import { successResponse, notFoundResponse, serverErrorResponse, errorResponse, unauthorizedResponse } from '@/lib/api/response';
import { getDefaultAccount } from '@/lib/storage/accounts';
import { getCloudinaryThumbnailUrl, getCloudinaryLightboxUrl } from '@/lib/cloudinary';
import { safeClientSelect } from '@/lib/api/select';
import { z } from 'zod';
import { parseCursorSafe, createPublicPaginationResponse } from '@/types/pagination';
import { serializeBigInt } from '@/lib/bigint-utils';

const PHOTOS_PER_PAGE = 100;
const tokenSchema = z.string().cuid().or(z.string().min(10).max(50));

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'CLIENT') {
      return unauthorizedResponse();
    }

    const { token } = await params;
    
    const tokenValidation = tokenSchema.safeParse(token);
    if (!tokenValidation.success) {
      return errorResponse('Invalid gallery token format', 400);
    }
    
    const { searchParams } = new URL(request.url);
    const paginationResult = parseCursorSafe(searchParams);
    if (!paginationResult.success) {
      return errorResponse(paginationResult.error.errors[0].message, 400);
    }
    const { cursor } = paginationResult.data;

    const gallery = await prisma.gallery.findUnique({
      where: { clientToken: token },
      include: {
        event: {
          include: {
            // Strip Client.password (bcrypt hash) before returning to the
            // portal client viewer.
            client: { select: safeClientSelect },
          },
        },
        selections: {
          orderBy: { submittedAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!gallery) {
      return notFoundResponse('Gallery not found');
    }

    if (gallery.event.clientId !== session.user.id) {
      return errorResponse('Forbidden', 403);
    }

    const photos = await prisma.photo.findMany({
      where: { 
        galleryId: gallery.id
      },
      orderBy: [{ order: 'asc' }, { id: 'asc' }],
      take: PHOTOS_PER_PAGE + 1,
      skip: cursor ? 1 : 0,
      cursor: cursor ? { id: cursor } : undefined,
    });

    const pagination = createPublicPaginationResponse(photos, PHOTOS_PER_PAGE);
    const photoList = photos.slice(0, PHOTOS_PER_PAGE);

    const latestSelection = gallery.selections[0];
    const selectedPhotoIds = latestSelection
      ? await prisma.photoSelection.findMany({
          where: { selectionId: latestSelection.id },
          select: { photoId: true },
        })
      : [];

    const selections = selectedPhotoIds.map((s: { photoId: string }) => s.photoId);

    const cloudinaryAccount = await getDefaultAccount('CLOUDINARY');
    const cloudName = cloudinaryAccount?.cloudName || process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;

    const serializedPhotos = photoList.map((photo: typeof photoList[number]) => {
      let thumbnailUrl = photo.thumbnailUrl;
      let lightboxUrl = photo.url;
      
      if (cloudName) {
        if (!thumbnailUrl) {
          thumbnailUrl = getCloudinaryThumbnailUrl(photo.url, { width: 400, cloudName });
        }
        lightboxUrl = getCloudinaryLightboxUrl(photo.url, cloudName);
      }
      
      return {
        ...photo,
        thumbnailUrl: thumbnailUrl || photo.url,
        lightboxUrl,
        fileSize: serializeBigInt(photo.fileSize),
      };
    });

    return successResponse({
      gallery: {
        ...gallery,
        photos: serializedPhotos,
        selections,
        isSelectionLocked: gallery.isSelectionLocked,
        pagination,
      },
    });
  } catch (error) {
    console.error('Error fetching gallery:', error);
    return serverErrorResponse('Failed to fetch gallery');
  }
}
