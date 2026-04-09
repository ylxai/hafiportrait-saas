import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { successResponse, notFoundResponse, serverErrorResponse } from '@/lib/api/response';
import { getPublicUrl } from '@/lib/storage/r2';
import { generateDownloadUrl } from '@/lib/upload/presigned';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string; photoId: string }> }
) {
  try {
    const { photoId } = await params;

    const photo = await prisma.photo.findUnique({
      where: { id: photoId },
    });

    if (!photo) {
      return notFoundResponse('Photo not found');
    }

    // Check if R2 key exists
    if (photo.r2Key) {
      const signedUrl = await generateDownloadUrl(photo.r2Key);
      return successResponse({ downloadUrl: signedUrl });
    }

    // Fallback to public URL
    return successResponse({ downloadUrl: photo.url });
  } catch (error) {
    console.error('Error generating download URL:', error);
    return serverErrorResponse('Failed to generate download URL');
  }
}