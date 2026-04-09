import { prisma } from '@/lib/db';
import { successResponse, notFoundResponse, serverErrorResponse } from '@/lib/api/response';
import { getDefaultAccount } from '@/lib/storage/accounts';
import { getCloudinaryThumbnailUrl } from '@/lib/cloudinary';

const PHOTOS_PER_PAGE = 100;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const { searchParams } = new URL(request.url);
    const cursor = searchParams.get('cursor');
    
    // Parse and validate cursor
    const cursorId = cursor && cursor !== 'null' && cursor !== 'undefined' 
      ? cursor 
      : undefined;

    // Fetch gallery info and photos in parallel
    const [gallery, photos] = await Promise.all([
      // Get gallery with event info
      prisma.gallery.findUnique({
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
      }),
      // Get paginated photos
      prisma.photo.findMany({
        where: { 
          gallery: { clientToken: token }
        },
        orderBy: [{ order: 'asc' }, { id: 'asc' }],
        take: PHOTOS_PER_PAGE + 1, // Take one extra to check if there's more
        skip: cursorId ? 1 : 0,
        cursor: cursorId ? { id: cursorId } : undefined,
      }),
    ]);

    if (!gallery) {
      return notFoundResponse('Gallery not found');
    }

    // Check if there's a next page
    const hasMore = photos.length > PHOTOS_PER_PAGE;
    const photoList = hasMore ? photos.slice(0, PHOTOS_PER_PAGE) : photos;
    const nextCursor = hasMore ? photoList[photoList.length - 1]?.id : null;

    // Increment view count (fire and forget, don't block response)
    prisma.gallery.update({
      where: { id: gallery.id },
      data: { viewCount: { increment: 1 } },
    }).catch(() => {}); // Silently fail

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
        fileSize: photo.fileSize?.toString() || null,
      };
    });

    return successResponse({
      gallery: {
        ...gallery,
        photos: serializedPhotos,
        selections,
        isSelectionLocked: gallery.isSelectionLocked,
        pagination: {
          hasMore,
          nextCursor,
          perPage: PHOTOS_PER_PAGE,
        },
      },
    });
  } catch (error) {
    console.error('Error fetching gallery:', error);
    return serverErrorResponse('Failed to fetch gallery');
  }
}