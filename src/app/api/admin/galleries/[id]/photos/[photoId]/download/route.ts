import { prisma } from '@/lib/db';
import { successResponse, notFoundResponse, serverErrorResponse } from '@/lib/api/response';
import { generateDownloadUrl } from '@/lib/upload/presigned';
import { NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/auth/require-admin-auth';
import { withRequestContext } from '@/lib/with-request-context';
import { logger } from '@/lib/logger';

export const GET = withRequestContext(async (
  request: Request,
  { params }: { params: Promise<{ id: string; photoId: string }> }
) => {
  try {
    const auth = await requireAdminAuth();
    if (auth instanceof NextResponse) return auth;

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

    const signedUrl = await generateDownloadUrl(photo.r2Key);

    return successResponse({ downloadUrl: signedUrl });
  } catch (error) {
    logger.error('admin.photo.download.generate_url_failed', { err: error });
    return serverErrorResponse('Failed to generate download URL');
  }
});