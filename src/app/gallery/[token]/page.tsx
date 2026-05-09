import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import GalleryClient from './GalleryClient';

type PageProps = {
  // Next.js 15: params is a Promise and must be awaited.
  params: Promise<{ token: string }>;
};

// SEO / OpenGraph: fetch only the minimum gallery data needed for tags.
// Keeping this lightweight so unfurl previews (WhatsApp, social media) work
// without forcing the heavy interactive bundle to render server-side.
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { token } = await params;

  const gallery = await prisma.gallery.findUnique({
    where: { clientToken: token },
    select: {
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

  // Existence check at the server boundary so a bad token returns 404 with the
  // proper Next.js error UI instead of a blank "Galeri tidak ditemukan" client
  // state. The interactive bundle continues to fetch full data via /api.
  const exists = await prisma.gallery.findUnique({
    where: { clientToken: token },
    select: { id: true },
  });
  if (!exists) {
    notFound();
  }

  return <GalleryClient token={token} />;
}
