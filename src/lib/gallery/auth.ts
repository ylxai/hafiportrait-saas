/**
 * Gallery ownership assertion shared between the public gallery API
 * subroutes (`/api/public/gallery/[token]/...`).
 *
 * The unified rule is: *only the signed-in CLIENT who owns the underlying
 * event may access the gallery's data*. Anonymous viewers, admins, and
 * cross-client clients all get a generic `404 Gallery not found` so the
 * API never leaks the existence of someone else's gallery.
 *
 * Returning `404` (not `401`/`403`) on the negative path is intentional:
 * - Distinguishing "anonymous" from "wrong owner" leaks whether a token
 *   exists in the system.
 * - The legacy `/route.ts` (token listing) historically returned `401` for
 *   anonymous; we keep that contract there for client-side redirect
 *   purposes, but subroutes should mimic the not-found shape used by the
 *   `submit/route.ts` endpoint, since they're invoked after the page has
 *   already gated the user.
 */
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';
import { prisma } from '@/lib/db';
import { errorResponse, notFoundResponse } from '@/lib/api/response';

export type GalleryOwnership = {
  galleryId: string;
  eventId: string;
  clientId: string;
};

type Failure = ReturnType<typeof errorResponse>;

/**
 * Resolve the gallery referenced by `token` and assert the current request
 * is from its owning CLIENT.
 *
 * On success, returns the minimal ownership descriptor the caller needs to
 * proceed. On failure, returns a ready-to-throw `NextResponse` and the
 * caller should `return` it directly.
 *
 * Usage:
 *   const result = await assertGalleryOwnership(token);
 *   if ('response' in result) return result.response;
 *   const { galleryId } = result;
 */
export async function assertGalleryOwnership(
  token: string,
): Promise<GalleryOwnership | { response: Failure }> {
  const session = await getServerSession(authOptions);
  if (!session?.user || (session.user.role ?? '').toLowerCase() !== 'client') {
    // Match the not-found shape so we don't leak existence to anon/admin
    // callers — the caller's UI gates on `404` regardless.
    return { response: notFoundResponse('Gallery not found') };
  }

  const gallery = await prisma.gallery.findUnique({
    where: { clientToken: token },
    select: {
      id: true,
      eventId: true,
      event: { select: { clientId: true } },
    },
  });

  if (!gallery) {
    return { response: notFoundResponse('Gallery not found') };
  }

  if (gallery.event.clientId !== session.user.id) {
    return { response: notFoundResponse('Gallery not found') };
  }

  return {
    galleryId: gallery.id,
    eventId: gallery.eventId,
    clientId: gallery.event.clientId,
  };
}
