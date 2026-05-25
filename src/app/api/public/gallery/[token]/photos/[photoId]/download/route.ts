import { prisma } from '@/lib/db';
import { successResponse, notFoundResponse, serverErrorResponse } from '@/lib/api/response';
import { generateDownloadUrl } from '@/lib/upload/presigned';
import { assertGalleryOwnership } from '@/lib/gallery/auth';
import { withRequestContext } from '@/lib/with-request-context';

export const GET = withRequestContext(async (
  request: Request,
  { params }: { params: Promise<{ token: string; photoId: string }> }
) => {
  try {
    const { token, photoId } = await params;

    // Auth gate: previously this endpoint returned a signed R2 download URL
    // to anyone who knew (or guessed) a `(token, photoId)` pair, bypassing
    // every other gallery-lock check on the page/API. Reject anonymous,
    // wrong-role, and cross-client viewers with the same generic 404 the
    // page uses so the response shape doesn't leak existence.
    const ownership = await assertGalleryOwnership(token);
    if ('response' in ownership) return ownership.response;
    const { galleryId } = ownership;

    const photo = await prisma.photo.findUnique({
      where: { id: photoId },
      // Make sure the photo actually belongs to *this* gallery — without
      // this check, a valid `(token, photoId)` from one of the user's
      // galleries could be used to download a foreign photo.
      select: {
        r2Key: true,
        url: true,
        galleryId: true,
      },
    });

    if (!photo || photo.galleryId !== galleryId) {
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
});