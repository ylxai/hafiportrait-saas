import { prisma } from '@/lib/db';
import {
  successResponse,
  notFoundResponse,
  serverErrorResponse,
} from '@/lib/api/response';
import { assertGalleryOwnership } from '@/lib/gallery/auth';
import { getDefaultAccount } from '@/lib/storage/accounts';
import { stringifyWithBigInt } from '@/lib/bigint-utils';
import { serializeGalleryPhoto } from '@/lib/gallery/load-public-gallery';
import { withRequestContext } from '@/lib/with-request-context';
import { logger } from '@/lib/logger';

/**
 * Returns a single photo row for the owning client in the same wire-shape
 * the list loader (`/api/public/gallery/[token]`) produces. Used by the
 * realtime `photo-uploaded` subscriber in `GalleryClient.tsx` so a newly
 * uploaded photo can be merged into the grid without depending on whether
 * it landed inside SWR's page-1 slice (`PHOTOS_PER_PAGE = 20`, ordered by
 * `order ASC, id ASC` — new uploads tend to land at the tail of large
 * galleries).
 *
 * Auth semantics intentionally mirror `view/route.ts` and the `download`
 * subroute: anonymous / wrong-role / cross-client requests return the same
 * generic 404 to avoid leaking gallery existence.
 */
export const GET = withRequestContext(async (
  request: Request,
  { params }: { params: Promise<{ token: string; photoId: string }> },
) => {
  try {
    const { token, photoId } = await params;

    const ownership = await assertGalleryOwnership(token);
    if ('response' in ownership) return ownership.response;
    const { galleryId } = ownership;

    const photo = await prisma.photo.findUnique({
      where: { id: photoId },
    });

    // Same generic 404 for "photo doesn't exist" and "photo belongs to a
    // different gallery on this client" — never let cross-gallery photoId
    // probing distinguish the two.
    if (!photo || photo.galleryId !== galleryId) {
      return notFoundResponse('Photo not found');
    }

    const cloudinaryAccount = await getDefaultAccount('CLOUDINARY');
    const cloudName = cloudinaryAccount?.cloudName ?? undefined;

    const serialized = serializeGalleryPhoto(photo, cloudName);

    // Round-trip through JSON so Date → ISO and BigInt → string match the
    // list endpoint byte-for-byte; the realtime subscriber merges this into
    // an array of rows that came from the list loader, so any drift would
    // surface as a runtime cast error in the consumer.
    const payload = JSON.parse(stringifyWithBigInt({ photo: serialized })) as {
      photo: Record<string, unknown>;
    };

    return successResponse(payload);
  } catch (error) {
    logger.error('public.gallery.photo.lookup_failed', { err: error });
    return serverErrorResponse('Failed to load photo');
  }
});
