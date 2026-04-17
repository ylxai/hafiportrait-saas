import { prisma } from '@/lib/db';
import { successResponse, notFoundResponse, serverErrorResponse, errorResponse } from '@/lib/api/response';
import { getDefaultAccount } from '@/lib/storage/accounts';
import { getCloudinaryThumbnailUrl } from '@/lib/cloudinary';
import { z } from 'zod';
import { parseCursor, createPublicPaginationResponse } from '@/types/pagination';
import { serializeBigInt } from '@/lib/bigint-utils';

const PHOTOS_PER_PAGE = 100;

// Validate token format (CUID)
const tokenSchema = z.string().cuid().or(z.string().min(10).max(50));

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    
    // Validate token format
    const tokenValidation = tokenSchema.safeParse(token);
    if (!tokenValidation.success) {
      return errorResponse('Invalid gallery token format', 400);
    }
    
    const { searchParams } = new URL(request.url);
    const cursor = parseCursor(searchParams);

    // Get gallery with event info
    const gallery = await prisma.gallery.findUnique({
      where: { clientToken: token },
      include: {
        event: {
          include: {
            client: true,
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

    // Get paginated photos using the gallery ID to optimize index usage
    const photos = await prisma.photo.findMany({
      where: { 
        galleryId: gallery.id
      },
      orderBy: [{ order: 'asc' }, { id: 'asc' }],
      take: PHOTOS_PER_PAGE + 1, // Take one extra to check if there's more
      skip: cursor ? 1 : 0,
      cursor: cursor ? { id: cursor } : undefined,
    });

    // Create pagination response
    const pagination = createPublicPaginationResponse(photos, PHOTOS_PER_PAGE);
    const photoList = photos.slice(0, PHOTOS_PER_PAGE);

    // Get latest selection
    const latestSelection = gallery.selections[0];
    const selectedPhotoIds = latestSelection
      ? await prisma.photoSelection.findMany({
          where: { selectionId: latestSelection.id },
          select: { photoId: true },
        })
      : [];

    const selections = selectedPhotoIds.map((s) => s.photoId);

    // Get Cloudinary config for dynamic thumbnails
    const cloudinaryAccount = await getDefaultAccount('CLOUDINARY');
    const cloudName = cloudinaryAccount?.cloudName || process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;

    // Serialize BigInt fields for JSON and compute thumbnails if missing
    const serializedPhotos = photoList.map(photo => {
      let thumbnailUrl = photo.thumbnailUrl;
      if (!thumbnailUrl && cloudName) {
        thumbnailUrl = getCloudinaryThumbnailUrl(photo.url, { width: 400, cloudName });
      }
      
      return {
        ...photo,
        thumbnailUrl: thumbnailUrl || photo.url,
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