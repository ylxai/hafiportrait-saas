import { cache } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { loadPublicGallery } from '@/lib/gallery/load-public-gallery';
import GalleryClient from './GalleryClient';

type PageProps = {
  // Next.js 15: params is a Promise and must be awaited.
  params: Promise<{ token: string }>;
};

// `React.cache` deduplicates the gallery lookup across `generateMetadata` and
// the page render within a single request — Next.js does not auto-dedup ORM
// calls (only `fetch`). One DB round-trip serves both SEO tags and the
// existence check / 404.
const getGalleryHead = cache(async (token: string) => {
  return prisma.gallery.findUnique({
    where: { clientToken: token },
    select: {
      id: true,
      namaProject: true,
      welcomeMessage: true,
      bannerClientName: true,
      photos: {
        select: { thumbnailUrl: true, url: true },
        take: 1,
        orderBy: [{ order: 'asc' }, { id: 'asc' }],
      },
    },
  });
});

// SEO / OpenGraph: fetch only the minimum gallery data needed for tags.
// Keeping this lightweight so unfurl previews (WhatsApp, social media) work
// without forcing the heavy interactive bundle to render server-side.
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { token } = await params;
  const gallery = await getGalleryHead(token);

  if (!gallery) {
    return {
      title: 'Galeri tidak ditemukan',
      robots: { index: false, follow: false },
    };
  }

  const title = gallery.bannerClientName
    ? `${gallery.namaProject} — ${gallery.bannerClientName}`
    : gallery.namaProject;
  const description = gallery.welcomeMessage ?? 'Galeri foto profesional dari PhotoStudio.';
  const cover = gallery.photos[0]?.thumbnailUrl || gallery.photos[0]?.url;

  return {
    title,
    description,
    // Public token URLs should not be indexed by search engines.
    robots: { index: false, follow: false },
    openGraph: {
      title,
      description,
      type: 'website',
      images: cover ? [{ url: cover }] : undefined,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: cover ? [cover] : undefined,
    },
  };
}

export default async function GalleryPage({ params }: PageProps) {
  const { token } = await params;

  // Fetch the full gallery payload server-side so the very first paint has
  // photos + selections without a client round-trip. The result is shaped to
  // match the REST endpoint exactly (`{ data: { gallery } }`) and seeded
  // into SWR via `fallbackData`, so subsequent revalidations stay coherent.
  const payload = await loadPublicGallery(token);
  if (!payload) {
    notFound();
  }

  // SWR expects the same envelope the fetcher returns: `{ data: ... }`.
  // The payload was already JSON-roundtripped inside `loadPublicGallery`, so
  // the cast to GalleryClient's strict prop type is shape-compatible.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const initialData = { data: payload } as any;

  return <GalleryClient token={token} initialData={initialData} />;
}
