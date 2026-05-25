import { cache } from 'react';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/db';
import { authOptions } from '@/lib/auth/options';
import { isClientSession } from '@/lib/auth/role-helpers';
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
      // Used by the auth gate below to verify that the logged-in client owns
      // the event behind this gallery before any expensive payload fetch.
      event: { select: { clientId: true } },
      photos: {
        select: { thumbnailUrl: true, url: true },
        take: 1,
        orderBy: [{ order: 'asc' }, { id: 'asc' }],
      },
    },
  });
});

// Generic / safe metadata returned whenever the viewer is not allowed to see
// the gallery (no session, wrong role, wrong owner, gallery missing, etc.).
// Returning a generic shell prevents `<title>` and `og:*` tags from leaking
// the existence or name of someone else's gallery to a logged-in client who
// is not the owner — a privacy/info-disclosure issue caught during live
// E2E testing of PR #70.
const GENERIC_NOT_FOUND_METADATA: Metadata = {
  title: 'Galeri tidak ditemukan',
  robots: { index: false, follow: false },
};

// SEO / OpenGraph: fetch only the minimum gallery data needed for tags.
// Keeping this lightweight so unfurl previews (WhatsApp, social media) work
// without forcing the heavy interactive bundle to render server-side.
//
// Auth-aware: only emit the real metadata if the current viewer is allowed
// to see this gallery. Anonymous viewers, viewers signed in with the wrong
// role, and viewers who are not the gallery owner all get the generic
// "Galeri tidak ditemukan" shell — identical to what a request for a
// non-existent token would return — so an attacker cannot enumerate gallery
// existence or names by inspecting `<title>` / `<meta og:*>`.
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { token } = await params;
  const gallery = await getGalleryHead(token);

  if (!gallery) {
    return GENERIC_NOT_FOUND_METADATA;
  }

  const session = await getServerSession(authOptions);
  if (!isClientSession(session)) {
    return GENERIC_NOT_FOUND_METADATA;
  }
  if (session.user.id !== gallery.event.clientId) {
    return GENERIC_NOT_FOUND_METADATA;
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

  // -----------------------------------------------------------------------
  //  Auth gate — galleries are NEVER public anymore.
  //
  //  Without this, anyone who learned (or guessed) a gallery token could
  //  view photos and even submit selections, because the page used to be
  //  in the public-routes allowlist. We now require that:
  //    1. The viewer is signed in via the NextAuth `client` provider
  //       (role === 'CLIENT').
  //    2. The signed-in client owns the event the gallery belongs to.
  //
  //  Anonymous viewers get redirected to the portal login with a
  //  `callbackUrl` so they come back here after signing in. Wrong-owner
  //  viewers (e.g. another client's session) get a 404 — we deliberately
  //  do not reveal whether the gallery exists for them.
  // -----------------------------------------------------------------------
  const head = await getGalleryHead(token);
  if (!head) {
    notFound();
  }

  const session = await getServerSession(authOptions);
  if (!isClientSession(session)) {
    redirect(`/portal/login?callbackUrl=${encodeURIComponent(`/gallery/${token}`)}`);
  }
  if (session.user.id !== head.event.clientId) {
    notFound();
  }

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
