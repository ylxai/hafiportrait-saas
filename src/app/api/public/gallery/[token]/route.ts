import { prisma } from '@/lib/db';
import { successResponse, notFoundResponse, serverErrorResponse } from '@/lib/api/response';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;

    const gallery = await prisma.gallery.findUnique({
      where: { clientToken: token },
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
          take: 1,
        },
      },
    });

    if (!gallery) {
      return notFoundResponse('Gallery not found');
    }

    // Increment view count
    await prisma.gallery.update({
      where: { id: gallery.id },
      data: { viewCount: { increment: 1 } },
    });

    // Get latest selection
    const latestSelection = gallery.selections[0];
    const selectedPhotoIds = latestSelection
      ? await prisma.photoSelection.findMany({
          where: { selectionId: latestSelection.id },
          select: { photoId: true },
        })
      : [];

    const selections = selectedPhotoIds.map((s) => s.photoId);

    return successResponse({
      gallery: {
        ...gallery,
        selections,
        isSelectionLocked: latestSelection !== null,
      },
    });
  } catch (error) {
    console.error('Error fetching gallery:', error);
    return serverErrorResponse('Failed to fetch gallery');
  }
}