'use client';

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import Image from 'next/image';
import useSWR from 'swr';
import Masonry from 'react-masonry-css';
import { useSelectionSubscription, useViewCountSubscription, useAblyConnection } from '@/lib/hooks/useAbly';
import { publishSelectionUpdate, publishViewCount } from '@/lib/ably';

type Photo = {
  id: string;
  filename: string;
  url: string;
  thumbnailUrl: string | null;
  width: number | null;
  height: number | null;
};

type Pagination = {
  hasMore: boolean;
  nextCursor: string | null;
  perPage: number;
};

type GalleryData = {
  gallery: {
    id: string;
    namaProject: string;
    status: string;
    clientToken: string;
    viewCount: number;
    settings: {
      maxSelection: number;
      enableDownload: boolean;
      welcomeMessage: string | null;
      thankYouMessage: string | null;
      bannerClientName: string | null;
      bannerEventDate: string | null;
    };
    photos: Photo[];
    selections: string[];
    isSelectionLocked: boolean;
    pagination: Pagination;
  };
};

const breakpointColumns = {
  default: 4,
  1100: 3,
  700: 2,
  500: 1,
};

const fetcher = (url: string) => fetch(url).then((res) => {
  if (!res.ok) throw new Error('Gallery not found');
  return res.json();
});

function Lightbox({
  photos,
  currentIndex,
  onClose,
  onNavigate,
  onToggleSelect,
  hasPickspace,
  isLocked,
  selectedIds,
}: {
  photos: Photo[];
  currentIndex: number;
  onClose: () => void;
  onNavigate: (direction: number) => void;
  onToggleSelect: (photoId: string) => void;
  hasPickspace: boolean;
  isLocked: boolean;
  selectedIds: Set<string>;
}) {
  const currentPhoto = photos[currentIndex];
  if (!currentPhoto) return null;

  const isSelected = selectedIds.has(currentPhoto.id);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/95"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Lightbox viewer"
    >
      <button
        className="absolute top-4 right-4 text-white text-2xl p-2 hover:bg-white/10 rounded-lg transition-colors"
        onClick={onClose}
        aria-label="Tutup lightbox"
      >
        ✕
      </button>

      <button
        className="absolute left-4 text-white text-3xl p-2 hover:bg-white/10 rounded-lg transition-colors"
        onClick={(e) => { e.stopPropagation(); onNavigate(-1); }}
        aria-label="Foto sebelumnya"
      >
        ←
      </button>

      <div className="relative max-w-[90vw] max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
        <Image
          src={currentPhoto.url}
          alt={currentPhoto.filename}
          width={1200}
          height={800}
          className="max-w-full max-h-[85vh] object-contain"
          priority
          quality={90}
        />
      </div>

      <button
        className="absolute right-4 text-white text-3xl p-2 hover:bg-white/10 rounded-lg transition-colors"
        onClick={(e) => { e.stopPropagation(); onNavigate(1); }}
        aria-label="Foto berikutnya"
      >
        →
      </button>

      {hasPickspace && !isLocked && (
        <button
          onClick={(e) => { e.stopPropagation(); onToggleSelect(currentPhoto.id); }}
          className={`absolute bottom-4 px-6 py-3 rounded-full text-sm font-medium transition-colors ${
            isSelected
              ? 'bg-amber-500 text-white'
              : 'bg-white/20 text-white hover:bg-white/30'
          }`}
        >
          {isSelected ? '✓ Dipilih' : 'Pilih'}
        </button>
      )}

      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white text-sm">
        {currentIndex + 1} / {photos.length}
      </div>
    </div>
  );
}

export default function GalleryPage() {
  const params = useParams();
  const token = params.token as string;
  const containerRef = useRef<HTMLDivElement>(null);

  const [allPhotos, setAllPhotos] = useState<Photo[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const { data, error, isLoading } = useSWR<GalleryData>(
    token ? `/api/public/gallery/${token}` : null,
    fetcher,
    { 
      revalidateOnFocus: false, 
      revalidateOnReconnect: false,
      onSuccess: (data) => {
        // Only reset photos on initial load, not when polling
        if (allPhotos.length === 0) {
          setAllPhotos(data.gallery.photos);
          setPagination(data.gallery.pagination);
        }
      }
    }
  );

  const loadMore = useCallback(async () => {
    if (!pagination?.hasMore || !pagination.nextCursor || loadingMore) return;
    
    setLoadingMore(true);
    try {
      const res = await fetch(`/api/public/gallery/${token}?cursor=${pagination.nextCursor}`);
      const newData: GalleryData = await res.json();
      
      setAllPhotos(prev => [...prev, ...newData.gallery.photos]);
      setPagination(newData.gallery.pagination);
    } catch (err) {
      console.error('Error loading more photos:', err);
    } finally {
      setLoadingMore(false);
    }
  }, [pagination, token, loadingMore]);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<'all' | 'selected'>('all');
  const [submitting, setSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [bannerOpen, setBannerOpen] = useState(true);
  const [lightboxIndex, setLightboxIndex] = useState(-1);

  const gallery = data?.gallery;
  const photos = useMemo(() => allPhotos.length > 0 ? allPhotos : (gallery?.photos ?? []), [allPhotos, gallery?.photos]);

  const maxSelection = useMemo(() => gallery?.settings.maxSelection ?? 0, [gallery?.settings.maxSelection]);
  const hasPickspace = useMemo(() => maxSelection > 0, [maxSelection]);
  const isLocked = useMemo(() => gallery?.isSelectionLocked ?? false, [gallery?.isSelectionLocked]);
  const serverSelections = useMemo(() => new Set(gallery?.selections ?? []), [gallery?.selections]);
  const localSelectionCount = useMemo(() => !isLocked ? selectedIds.size : 0, [isLocked, selectedIds.size]);
  const isMaxed = useMemo(() => hasPickspace && !isLocked && localSelectionCount >= maxSelection, [hasPickspace, isLocked, localSelectionCount, maxSelection]);

  const serverSelectedPhotos = useMemo(() => photos.filter((p) => serverSelections.has(p.id)), [photos, serverSelections]);
  const draftSelectedPhotos = useMemo(() => photos.filter((p) => selectedIds.has(p.id)), [photos, selectedIds]);
  const activeSelectedPhotos = useMemo(() => isLocked ? serverSelectedPhotos : draftSelectedPhotos, [isLocked, serverSelectedPhotos, draftSelectedPhotos]);
  const activeSelectionCount = useMemo(() => isLocked ? serverSelectedPhotos.length : localSelectionCount, [isLocked, serverSelectedPhotos.length, localSelectionCount]);
  const hasBanner = useMemo(() => !!(gallery?.settings.welcomeMessage ?? gallery?.settings.bannerClientName), [gallery?.settings.welcomeMessage, gallery?.settings.bannerClientName]);

  useEffect(() => {
    if (gallery?.isSelectionLocked) {
      setSelectedIds(new Set(gallery.selections));
    }
  }, [gallery?.isSelectionLocked, gallery?.selections]);

  const handleSelectionUpdate = useCallback((update: { photoId: string; action: 'add' | 'remove'; selectionCount: number }) => {
    if (update.action === 'add') {
      setSelectedIds(prev => new Set([...prev, update.photoId]));
    } else {
      setSelectedIds(prev => {
        const newSet = new Set(prev);
        newSet.delete(update.photoId);
        return newSet;
      });
    }
  }, []);

  const handleViewCountUpdate = useCallback((count: number) => {
    if (data?.gallery) {
      data.gallery.viewCount = count;
    }
  }, [data?.gallery]);

  const isAblyConnected = useAblyConnection();
  useSelectionSubscription(gallery?.id || '', handleSelectionUpdate);
  useViewCountSubscription(gallery?.id || '', handleViewCountUpdate);

  useEffect(() => {
    if (gallery?.id) {
      fetch(`/api/admin/galleries/${gallery.id}/view`, { method: 'POST' }).catch(console.error);
    }
  }, [gallery?.id]);

  const toggleSelect = useCallback((photoId: string) => {
    if (isLocked) return;
    setSelectedIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(photoId)) {
        newSet.delete(photoId);
      } else if (!isMaxed || prev.has(photoId)) {
        newSet.add(photoId);
      }
      return newSet;
    });
  }, [isLocked, isMaxed]);

  const handleSubmit = useCallback(async () => {
    if (localSelectionCount === 0 || submitting || isLocked || !gallery?.id) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/public/gallery/${token}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photoIds: Array.from(selectedIds) }),
      });
      
      if (res.ok) {
        publishSelectionUpdate(gallery.id, {
          photoId: '',
          action: 'add',
          selectionCount: localSelectionCount,
          clientToken: token,
        });
      }
      
      setSelectedIds(new Set());
      setShowSuccess(true);
    } catch {
      alert('Gagal mengirim seleksi. Coba lagi.');
    } finally {
      setSubmitting(false);
    }
  }, [localSelectionCount, submitting, isLocked, token, selectedIds, gallery]);

  const handleDownload = useCallback(async () => {
    if (activeSelectedPhotos.length === 0) return;
    const downloadPromises = activeSelectedPhotos.map(async (photo) => {
      try {
        const res = await fetch(`/api/public/gallery/${token}/photos/${photo.id}/download`);
        const data = await res.json();
        const url = data.success && data.data?.downloadUrl ? data.data.downloadUrl : photo.url;
        const link = document.createElement('a');
        link.href = url;
        link.download = photo.filename;
        link.target = '_blank';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } catch (err) {
        console.error('Error downloading photo:', err);
      }
    });
    await Promise.all(downloadPromises);
  }, [activeSelectedPhotos, token]);

  const clearAll = useCallback(() => setSelectedIds(new Set()), []);
  const selectAll = useCallback(() => {
    if (!photos.length || isLocked) return;
    const allIds = photos.slice(0, maxSelection).map((p) => p.id);
    setSelectedIds(new Set(allIds));
  }, [photos, isLocked, maxSelection]);

  const openLightbox = useCallback((index: number) => {
    setLightboxIndex(index);
  }, []);

  const closeLightbox = useCallback(() => {
    setLightboxIndex(-1);
  }, []);

  const navigateLightbox = useCallback((direction: number) => {
    setLightboxIndex((prev) => (prev + direction + photos.length) % photos.length);
  }, [photos.length]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-amber-500 mx-auto mb-4"></div>
          <p className="text-slate-500">Memuat galeri…</p>
        </div>
      </div>
    );
  }

  if (error || !gallery) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
        <div className="text-center">
          <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl">📷</span>
          </div>
          <h2 className="text-xl font-semibold text-slate-900 mb-2">Galeri tidak ditemukan</h2>
          <p className="text-slate-500">Link galeri tidak valid</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50" ref={containerRef}>
      {showSuccess && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true" aria-label="Success dialog">
          <div className="bg-white rounded-xl max-w-sm w-full p-8 text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl text-green-600">✓</span>
            </div>
            <h2 className="text-xl font-bold text-slate-900 mb-2">Pilihan Dikirim!</h2>
            <p className="text-slate-500 text-sm mb-4">Terima kasih. Fotografer akan memproses pilihan Anda.</p>
            {gallery.settings.thankYouMessage && (
              <p className="text-sm italic text-slate-600 bg-slate-50 p-3 rounded-lg mb-4">&quot;{gallery.settings.thankYouMessage}&quot;</p>
            )}
            <button onClick={() => setShowSuccess(false)} className="w-full py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600">
              Tutup
            </button>
          </div>
        </div>
      )}

      <header className="sticky top-0 bg-white border-b border-slate-200 z-30">
        <div className="px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="font-bold text-slate-900">{gallery.namaProject}</h1>
            <span className="text-xs text-slate-500 flex items-center gap-2">
              {photos.length} foto
              {isAblyConnected && (
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-green-500"></span>
                  Live
                </span>
              )}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {hasPickspace && !isLocked && localSelectionCount > 0 && (
              <button onClick={handleSubmit} disabled={submitting} className="px-4 py-2 bg-amber-500 text-white text-sm font-medium rounded-lg hover:bg-amber-600 disabled:opacity-50">
                {submitting ? 'Mengirim…' : `Kirim (${localSelectionCount})`}
              </button>
            )}
            {hasPickspace && isLocked && (
              <span className="px-3 py-2 bg-green-100 text-green-700 text-xs font-medium rounded-full">✓ Terkirim</span>
            )}
          </div>
        </div>
        {hasPickspace && !isLocked && localSelectionCount > 0 && (
          <div className="px-4 pb-3">
            <div className="flex items-center gap-2">
              <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all ${isMaxed ? 'bg-red-500' : 'bg-amber-500'}`} style={{ width: `${Math.min((localSelectionCount / maxSelection) * 100, 100)}%` }} />
              </div>
              <span className="text-xs text-slate-500">{localSelectionCount}/{maxSelection}</span>
            </div>
          </div>
        )}
      </header>

      {hasBanner && (
        <div className="mx-4 mt-4 bg-white rounded-lg p-4 border border-slate-100">
          <div className="flex justify-between items-start">
            <div className="text-center flex-1">
              {gallery.settings.bannerClientName && (
                <p className="text-xs font-medium uppercase tracking-wider text-amber-600">{gallery.settings.bannerClientName}</p>
              )}
              {bannerOpen && (
                <>
                  {gallery.settings.welcomeMessage && <p className="text-sm text-slate-600 mt-1">{gallery.settings.welcomeMessage}</p>}
                  {gallery.settings.bannerEventDate && <p className="text-xs text-slate-400 mt-1">{gallery.settings.bannerEventDate}</p>}
                </>
              )}
            </div>
            <button onClick={() => setBannerOpen(!bannerOpen)} className="text-slate-400 hover:text-slate-600" aria-label={bannerOpen ? 'Tutup banner' : 'Buka banner'}>
              {bannerOpen ? '▲' : '▼'}
            </button>
          </div>
        </div>
      )}

      {hasPickspace && (
        <div className="mx-4 mt-3 flex gap-1 bg-white rounded-lg p-1 border border-slate-100">
          <button onClick={() => setActiveTab('all')} className={`flex-1 py-2.5 text-sm font-medium rounded-md transition-colors ${activeTab === 'all' ? 'bg-amber-50 text-amber-700' : 'text-slate-500 hover:bg-slate-50'}`}>
            Semua Foto
          </button>
          <button onClick={() => setActiveTab('selected')} className={`flex-1 py-2.5 text-sm font-medium rounded-md transition-colors ${activeTab === 'selected' ? 'bg-amber-50 text-amber-700' : 'text-slate-500 hover:bg-slate-50'}`}>
            Terpilih ({activeSelectionCount})
          </button>
        </div>
      )}

      <main className="p-4">
        {photos.length === 0 ? (
          <div className="text-center py-16"><p className="text-slate-500">Belum ada foto</p></div>
        ) : activeTab === 'all' ? (
          <>
            <Masonry
              breakpointCols={breakpointColumns}
              className="flex -ml-4 w-auto"
              columnClassName="pl-4 bg-clip-padding"
            >
              {photos.map((photo, index) => {
                const isSelected = isLocked ? serverSelections.has(photo.id) : selectedIds.has(photo.id);
                const canSelect = hasPickspace && !isLocked && (!isMaxed || isSelected);
                const aspectRatio = photo.width && photo.height ? photo.height / photo.width : 1;

                return (
                  <div
                    key={photo.id}
                    className="relative mb-4 rounded-lg overflow-hidden cursor-pointer group"
                    style={{ paddingBottom: `${aspectRatio * 100}%` }}
                    onClick={() => openLightbox(index)}
                    onKeyDown={(e) => e.key === 'Enter' && openLightbox(index)}
                    role="button"
                    tabIndex={0}
                  >
                    <div className="absolute inset-0">
                      <Image
                        src={photo.thumbnailUrl || photo.url}
                        alt={photo.filename}
                        fill
                        className="object-cover transition-transform duration-300 group-hover:scale-105"
                        sizes="(max-width: 500px) 100vw, (max-width: 700px) 50vw, (max-width: 1100px) 33vw, 25vw"
                      />
                    </div>
                    {hasPickspace && (
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleSelect(photo.id); }}
                        disabled={isLocked || !canSelect}
                        aria-label={isSelected ? 'Batal pilih' : 'Pilih foto'}
                        className={`absolute top-2 right-2 w-7 h-7 rounded-full border-2 flex items-center justify-center text-sm font-bold transition-all ${isSelected ? 'bg-amber-500 border-amber-500 text-white' : canSelect ? 'bg-white/80 border-slate-300 text-transparent hover:border-amber-500 hover:text-amber-500' : 'bg-slate-200 border-slate-300 cursor-not-allowed'}`}
                      >
                        ✓
                      </button>
                    )}
                  </div>
                );
              })}
            </Masonry>
            
            {/* Load More Button */}
            {pagination?.hasMore && (
              <div className="flex justify-center py-8">
                <button
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="px-6 py-3 bg-amber-500 text-white rounded-lg font-medium hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {loadingMore ? (
                    <span className="flex items-center gap-2">
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Memuat...
                    </span>
                  ) : (
                    `Muat ${pagination?.perPage || 100} foto lagi`
                  )}
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="space-y-3">
            {activeSelectedPhotos.length === 0 ? (
              <div className="text-center py-16">
                <p className="text-slate-500">{isLocked ? 'Tidak ada foto terpilih' : 'Belum ada foto dipilih'}</p>
                {!isLocked && <button onClick={() => setActiveTab('all')} className="text-amber-600 text-sm mt-2">← Lihat semua foto</button>}
              </div>
            ) : (
              <>
                <p className="text-sm text-slate-500">
                  {activeSelectedPhotos.length} foto terpilih
                  {!isLocked && isMaxed && <span className="text-red-500 font-medium"> (Kuota penuh)</span>}
                  {!isLocked && !isMaxed && <span> • Maks. {maxSelection}</span>}
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {activeSelectedPhotos.map((photo, idx) => {
                    const originalIndex = photos.findIndex((p) => p.id === photo.id);
                    return (
                      <div key={photo.id} className="relative aspect-square rounded-lg overflow-hidden bg-slate-100">
                        <Image
                          src={photo.thumbnailUrl || photo.url}
                          alt={photo.filename}
                          fill
                          className="object-cover"
                          onClick={() => openLightbox(originalIndex)}
                        />
                        <span className="absolute top-2 left-2 bg-amber-500 text-white text-xs px-2 py-1 rounded">{idx + 1}</span>
                        {!isLocked && (
                          <button
                            onClick={() => toggleSelect(photo.id)}
                            className="absolute top-2 right-2 bg-red-500 text-white text-xs px-2 py-1 rounded hover:bg-red-600"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
                {isLocked ? (
                  <div className="mt-4 flex gap-2">
                    {gallery.settings.enableDownload && activeSelectedPhotos.length > 0 && (
                      <button onClick={handleDownload} className="flex-1 py-3 bg-slate-100 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-200">↓ Download Semua</button>
                    )}
                  </div>
                ) : (
                  <div className="mt-4 flex gap-2">
                    <button onClick={selectAll} disabled={isMaxed} className="flex-1 py-3 bg-slate-100 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-200 disabled:opacity-50">Pilih Semua</button>
                    {localSelectionCount > 0 && <button onClick={clearAll} className="flex-1 py-3 border border-red-200 text-red-600 rounded-lg text-sm font-medium hover:bg-red-50">Hapus Semua</button>}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </main>

      <footer className="py-6 text-center text-xs text-slate-400">© {new Date().getFullYear()} PhotoStudio</footer>

      {lightboxIndex >= 0 && (
        <Lightbox
          photos={photos}
          currentIndex={lightboxIndex}
          onClose={closeLightbox}
          onNavigate={navigateLightbox}
          onToggleSelect={toggleSelect}
          hasPickspace={hasPickspace}
          isLocked={isLocked}
          selectedIds={selectedIds}
        />
      )}
    </div>
  );
}