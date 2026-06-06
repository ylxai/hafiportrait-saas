import GalleryDetailView from "./GalleryDetailView";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <GalleryDetailView galleryId={id} />;
}
