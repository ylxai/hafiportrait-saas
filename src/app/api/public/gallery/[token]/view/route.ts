import { prisma } from '@/lib/db';
import { successResponse, notFoundResponse } from '@/lib/api/response';
import { assertGalleryOwnership } from '@/lib/gallery/auth';
import { publishViewCount } from '@/lib/ably';

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

    // Optimistic next value used both in the immediate response below and in
    // the realtime broadcast — readers race with concurrent viewers anyway,
    // so eventually-consistent badges are fine.
    const nextCount = gallery.viewCount + 1;

    // Non-blocking view count increment; after the row is bumped we also
    // publish a realtime `view-count` event so any open subscriber
    // (`useViewCountSubscription` in the gallery viewer) re-renders the
    // badge without a refetch. Ably publish failures are swallowed inside
    // `publishViewCount` so a transient outage cannot break the increment.
    prisma.gallery
      .update({
        where: { id: galleryId },
        data: { viewCount: { increment: 1 } },
      })
      .then(() => publishViewCount(galleryId, nextCount))
      .catch((error: unknown) => {
        if (error && typeof error === 'object' && 'code' in error && error.code === 'P2025') {
          console.error('[API] Gallery record not found for analytics update');
        } else {
          console.error(`[API] Failed to increment view count for gallery ${galleryId}`, error);
        }
      });

    // Return immediately without waiting for increment
    return successResponse({ viewCount: nextCount });
  } catch (error) {
    console.error('[API] Error in view endpoint:', error);
    return notFoundResponse('Gallery not found');
  }
}
