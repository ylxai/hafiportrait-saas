import { prisma } from '@/lib/db';
import { successResponse, notFoundResponse } from '@/lib/api/response';
import { assertGalleryOwnership } from '@/lib/gallery/auth';
import { publishViewCount } from '@/lib/ably';
import { withRequestContext } from '@/lib/with-request-context';
import { logger } from '@/lib/logger';
import { isPrismaError } from '@/lib/prisma-error';
import { enforceBodySizeLimit, BODY_LIMITS } from '@/lib/api/body-size-limit';

export const POST = withRequestContext(async (
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) => {
  try {
    const tooLarge = enforceBodySizeLimit(request, BODY_LIMITS.JSON_SMALL);
    if (tooLarge) return tooLarge;

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

    // Optimistic value used only in the immediate response to this caller.
    // Concurrent viewers can race and each see `gallery.viewCount` here as
    // the same `N`, which is fine for a fire-and-forget badge but is *not*
    // safe to broadcast — see below.
    const nextCount = gallery.viewCount + 1;

    // Non-blocking view count increment; after the row is bumped we
    // publish a realtime `view-count` event so any open subscriber
    // (`useViewCountSubscription` in the gallery viewer) re-renders the
    // badge without a refetch. Critically we publish the *post-update*
    // count returned by Prisma (`updated.viewCount`) rather than the
    // optimistic pre-read `nextCount` — otherwise two concurrent viewers
    // would both publish `N+1` while the DB row actually reached `N+2`,
    // leaving the badge stuck under the real total. Ably publish failures
    // are swallowed inside `publishViewCount` so a transient outage cannot
    // break the increment itself.
    prisma.gallery
      .update({
        where: { id: galleryId },
        data: { viewCount: { increment: 1 } },
        select: { viewCount: true },
      })
      .then((updated) => publishViewCount(galleryId, updated.viewCount))
      .catch((error: unknown) => {
        if (isPrismaError(error, 'P2025')) {
          logger.error('public.gallery.view.record_not_found', { galleryId });
        } else {
          logger.error('public.gallery.view.increment_failed', { galleryId, err: error });
        }
      });

    // Return immediately without waiting for increment
    return successResponse({ viewCount: nextCount });
  } catch (error) {
    logger.error('public.gallery.view.unhandled_error', { err: error });
    return notFoundResponse('Gallery not found');
  }
});
