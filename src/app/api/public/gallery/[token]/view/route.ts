import { prisma } from '@/lib/db';
import { successResponse, notFoundResponse, serverErrorResponse } from '@/lib/api/response';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    
    const gallery = await prisma.gallery.findUnique({
      where: { clientToken: token },
    });

    if (!gallery) {
      return notFoundResponse('Gallery not found');
    }

    const updatedGallery = await prisma.gallery.update({
      where: { id: gallery.id },
      data: { viewCount: { increment: 1 } },
    });

    return successResponse({ viewCount: updatedGallery.viewCount });
  } catch (error) {
    console.error('Error incrementing view count:', error);
    return serverErrorResponse('Failed to increment view count');
  }
}
