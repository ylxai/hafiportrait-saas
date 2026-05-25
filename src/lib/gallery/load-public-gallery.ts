import { prisma } from '@/lib/db';
import { getDefaultAccount } from '@/lib/storage/accounts';
import { getCloudinaryThumbnailUrl, getCloudinaryLightboxUrl } from '@/lib/cloudinary';
import { createPublicPaginationResponse } from '@/types/pagination';
import { serializeBigInt, stringifyWithBigInt } from '@/lib/bigint-utils';
import { safeClientSelect } from '@/lib/api/select';

const PHOTOS_PER_PAGE = 20;

// Re-exported `Photo` row shape we pass through (Prisma model, but
// `serializeGalleryPhoto` widens `fileSize` from BigInt → string so the
// output is wire-safe and can be JSON-roundtripped without throwing).
type PrismaPhotoRow = Awaited<ReturnType<typeof prisma.photo.findUnique>>;

/**
 * Shared per-photo serializer used by both the list loader and the single
 * photo lookup endpoint (`/api/public/gallery/[token]/photos/[photoId]`).
 *
 * Centralised here so the realtime `photo-uploaded` subscriber can append a
 * newly-uploaded photo with the *exact* shape the SWR cache already holds —
 * any drift between the list and the targeted fetch would break the dedupe
 * logic in `GalleryClient.onSuccess` (we key off `photo.id` but render
 * `thumbnailUrl` / `lightboxUrl`).
 */
export function serializeGalleryPhoto(
  photo: NonNullable<PrismaPhotoRow>,
  cloudName: string | undefined,
) {
  let thumbnailUrl = photo.thumbnailUrl;
  let lightboxUrl = photo.url;

  if (cloudName) {
    if (!thumbnailUrl) {
      thumbnailUrl = getCloudinaryThumbnailUrl(photo.url, { width: 400, cloudName });
    }
    lightboxUrl = getCloudinaryLightboxUrl(photo.url, cloudName);
  }

  return {
    ...photo,
    thumbnailUrl: thumbnailUrl || photo.url,
    lightboxUrl,
    fileSize: serializeBigInt(photo.fileSize),
  };
}

/**
 * Shared loader for the public gallery payload.
 *
 * Used by:
 *  - The Server Component (`src/app/gallery/[token]/page.tsx`) to seed SWR
 *    `fallbackData` so the first paint is instant and the client does not
 *    re-fetch the same payload on hydrate.
 *  - The REST endpoint (`/api/public/gallery/[token]`) which keeps the same
 *    contract for paginated cursor calls (`loadMore`).
 *
 * The returned shape is identical to the API endpoint's `data` field so it
 * can be dropped straight into SWR `fallbackData` keyed by the GET URL.
 */
export type PublicGalleryPayload = Awaited<ReturnType<typeof loadPublicGallery>>;

export async function loadPublicGallery(token: string, cursor?: string | null) {
  const gallery = await prisma.gallery.findUnique({
    where: { clientToken: token },
    include: {
      // Strip Client.password (bcrypt hash) — this payload crosses the
      // server→browser boundary as `fallbackData` for SWR.
      event: { include: { client: { select: safeClientSelect } } },
      selections: { orderBy: { submittedAt: 'desc' }, take: 1 },
    },
  });

  if (!gallery) return null;

  const photos = await prisma.photo.findMany({
    where: { galleryId: gallery.id },
    orderBy: [{ order: 'asc' }, { id: 'asc' }],
    take: PHOTOS_PER_PAGE + 1,
    skip: cursor ? 1 : 0,
    cursor: cursor ? { id: cursor } : undefined,
  });

  const pagination = createPublicPaginationResponse(photos, PHOTOS_PER_PAGE);
  const photoList = photos.slice(0, PHOTOS_PER_PAGE);

  const latestSelection = gallery.selections[0];
  const selectedPhotoIds = latestSelection
    ? await prisma.photoSelection.findMany({
        where: { selectionId: latestSelection.id },
        select: { photoId: true },
      })
    : [];

  const selections = selectedPhotoIds.map((s) => s.photoId);

  const cloudinaryAccount = await getDefaultAccount('CLOUDINARY');
  const cloudName = cloudinaryAccount?.cloudName ?? undefined;

  const serializedPhotos = photoList.map((photo) => serializeGalleryPhoto(photo, cloudName));

  const payload = {
    gallery: {
      ...gallery,
      photos: serializedPhotos,
      selections,
      isSelectionLocked: gallery.isSelectionLocked,
      pagination,
    },
  };

  // Round-trip through JSON so the shape exactly matches what the REST
  // endpoint returns (Date → ISO string, BigInt → string). This keeps the
  // Server Component's `fallbackData` byte-compatible with subsequent SWR
  // refetches and avoids serialization errors when crossing the
  // Server→Client component boundary.
  return JSON.parse(stringifyWithBigInt(payload)) as PublicGalleryPayloadJSON;
}

// Inferred from the JSON-roundtripped shape.
export type PublicGalleryPayloadJSON = {
  gallery: Record<string, unknown> & {
    id: string;
    photos: Array<Record<string, unknown>>;
    selections: string[];
    isSelectionLocked: boolean;
    pagination: ReturnType<typeof createPublicPaginationResponse>;
  };
};
