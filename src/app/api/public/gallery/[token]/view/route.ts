import { prisma } from '@/lib/db';
import { successResponse, notFoundResponse } from '@/lib/api/response';
import { assertGalleryOwnership } from '@/lib/gallery/auth';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;

    // Auth gate: only the owning client may bump the view count. Without
    // this anyone with a leaked token could pollute analytics, and worse,
    // confirm the existence of someone else's gallery (the previous
    // implementation responded `200 { viewCount }` for any valid token).
    const ownership = await assertGalleryOwnership(token);
    if ('response' in ownership) return ownership.response;
    const { galleryId } = ownership;

    const gallery = await prisma.gallery.findUnique({
      where: { id: galleryId },
      select: { viewCount: true },
    });
    if (!gallery) {
      return notFoundResponse('Gallery not found');
    }

    // Non-blocking view count increment
    prisma.gallery.update({
      where: { id: galleryId },
      data: { viewCount: { increment: 1 } },
    }).catch((error: unknown) => {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'P2025') {
        console.error('[API] Gallery record not found for analytics update');
      } else {
        console.error(`[API] Failed to increment view count for gallery ${galleryId}`, error);
      }
    });

    // Return immediately without waiting for increment
    return successResponse({ viewCount: gallery.viewCount + 1 });
  } catch (error) {
    console.error('[API] Error in view endpoint:', error);
    return notFoundResponse('Gallery not found');
  }
}
