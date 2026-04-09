import { prisma } from '@/lib/db';
import { successResponse, notFoundResponse, serverErrorResponse } from '@/lib/api/response';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { isSelectionLocked } = body;

    if (typeof isSelectionLocked !== 'boolean') {
      return serverErrorResponse('Invalid payload');
    }

    const gallery = await prisma.gallery.findUnique({
      where: { id },
    });

    if (!gallery) {
      return notFoundResponse('Gallery not found');
    }

    const updatedGallery = await prisma.gallery.update({
      where: { id },
      data: { isSelectionLocked },
    });

    return successResponse({
      gallery: updatedGallery,
    });
  } catch (error) {
    console.error('Error toggling gallery lock:', error);
    return serverErrorResponse('Failed to toggle lock');
  }
}
