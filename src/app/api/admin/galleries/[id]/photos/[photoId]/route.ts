import { prisma } from '@/lib/db';
import { successResponse, notFoundResponse, serverErrorResponse, errorResponse } from '@/lib/api/response';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';

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

    const photo = await prisma.photo.findUnique({
      where: { id: photoId },
    });

    if (!photo) {
      return notFoundResponse('Photo not found');
    }

    await prisma.photo.delete({
      where: { id: photoId },
    });

    return successResponse({ success: true });
  } catch (error) {
    console.error('Error deleting photo:', error);
    return serverErrorResponse('Failed to delete photo');
  }
}