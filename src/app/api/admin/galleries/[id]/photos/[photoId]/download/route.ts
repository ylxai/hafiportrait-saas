import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { successResponse, notFoundResponse, serverErrorResponse, errorResponse } from '@/lib/api/response';
import { getSignedDownloadUrl } from '@/lib/storage/r2';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';

export async function GET(
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

    if (!photo.r2Key) {
      return notFoundResponse('Original file not available');
    }

    const signedUrl = await getSignedDownloadUrl(photo.r2Key);

    return successResponse({ downloadUrl: signedUrl });
  } catch (error) {
    console.error('Error generating download URL:', error);
    return serverErrorResponse('Failed to generate download URL');
  }
}