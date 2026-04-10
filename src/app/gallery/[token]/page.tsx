'use client';

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import { LazyImage } from '@/components/ui/lazy-image';
import useSWR from 'swr';
import Masonry from 'react-masonry-css';
import YARLightbox from "yet-another-react-lightbox";
import Zoom from "yet-another-react-lightbox/plugins/zoom";
import "yet-another-react-lightbox/styles.css";
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { toast } from 'sonner';
import { useSelectionSubscription, useViewCountSubscription, useAblyConnection } from '@/lib/hooks/useAbly';
import { publishSelectionUpdate } from '@/lib/ably';

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
    maxSelection: number;
    enableDownload: boolean;
    welcomeMessage: string | null;
    thankYouMessage: string | null;
    bannerClientName: string | null;
    bannerEventDate: string | null;
    photos: Photo[];
    selections: string[];
    isSelectionLocked: boolean;
    pagination: Pagination;
  };
};

const breakpointColumns = {
  default: 4,
  1100: 3,
  700: 3,
  500: 2,
};

const fetcher = (url: string) => fetch(url).then((res) => {
  if (!res.ok) throw new Error('Gallery not found');
  return res.json();
});


export default function GalleryPage() {
  const params = useParams();
  const token = params.token as string;
  const containerRef = useRef<HTMLDivElement>(null);

  const [allPhotos, setAllPhotos] = useState<Photo[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const { data, error, isLoading, mutate } = useSWR<{ data: GalleryData }>(
    token ? `/api/public/gallery/${token}` : null,
    fetcher,
    { 
      revalidateOnFocus: false, 
      revalidateOnReconnect: false,
      onSuccess: (resData) => {
        // Only reset photos on initial load, not when polling
        if (allPhotos.length === 0) {
          setAllPhotos(resData.data.gallery.photos);
          setPagination(resData.data.gallery.pagination);
        }
      }
    }
  );

  const loadMore = useCallback(async () => {
    if (!pagination?.hasMore || !pagination.nextCursor || loadingMore) return;
    
    setLoadingMore(true);
    try {
      const res = await fetch(`/api/public/gallery/${token}?cursor=${pagination.nextCursor}`);
      const newData: { data: GalleryData } = await res.json();
      
      setAllPhotos(prev => [...prev, ...newData.data.gallery.photos]);
      setPagination(newData.data.gallery.pagination);
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
  const [downloadProgress, setDownloadProgress] = useState<{ active: boolean; current: number; total: number }>({ active: false, current: 0, total: 0 });

  const gallery = data?.data?.gallery;
  const photos = useMemo(() => allPhotos.length > 0 ? allPhotos : (gallery?.photos ?? []), [allPhotos, gallery?.photos]);

  const maxSelection = useMemo(() => gallery?.maxSelection ?? 0, [gallery?.maxSelection]);
  const hasPickspace = useMemo(() => maxSelection > 0, [maxSelection]);
  const isLocked = useMemo(() => gallery?.isSelectionLocked ?? false, [gallery?.isSelectionLocked]);
  const serverSelections = useMemo(() => new Set(gallery?.selections ?? []), [gallery?.selections]);
  const localSelectionCount = useMemo(() => !isLocked ? selectedIds.size : 0, [isLocked, selectedIds.size]);
  const isMaxed = useMemo(() => hasPickspace && !isLocked && localSelectionCount >= maxSelection, [hasPickspace, isLocked, localSelectionCount, maxSelection]);

  const serverSelectedPhotos = useMemo(() => photos.filter((p) => serverSelections.has(p.id)), [photos, serverSelections]);
  const draftSelectedPhotos = useMemo(() => photos.filter((p) => selectedIds.has(p.id)), [photos, selectedIds]);
  const activeSelectedPhotos = useMemo(() => isLocked ? serverSelectedPhotos : draftSelectedPhotos, [isLocked, serverSelectedPhotos, draftSelectedPhotos]);
  const activeSelectionCount = useMemo(() => isLocked ? serverSelectedPhotos.length : localSelectionCount, [isLocked, serverSelectedPhotos.length, localSelectionCount]);
  const hasBanner = useMemo(() => !!(gallery?.welcomeMessage ?? gallery?.bannerClientName), [gallery?.welcomeMessage, gallery?.bannerClientName]);

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
    if (data?.data?.gallery) {
      data.data.gallery.viewCount = count;
    }
  }, [data?.data?.gallery]);

  const isAblyConnected = useAblyConnection();
  useSelectionSubscription(gallery?.id || '', handleSelectionUpdate);
  useViewCountSubscription(gallery?.id || '', handleViewCountUpdate);

  useEffect(() => {
    if (token) {
      fetch(`/api/public/gallery/${token}/view`, { method: 'POST' }).catch(() => {});
    }
  }, [token]);

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
        await mutate(); // Re-fetch to update isLocked and server selections
        setShowSuccess(true);
      } else {
        toast.error('Gagal mengirim seleksi. Silakan periksa kembali dan coba lagi.');
      }
    } catch {
      toast.error('Terjadi kesalahan. Gagal mengirim seleksi. Coba lagi.');
    } finally {
      setSubmitting(false);
    }
  }, [localSelectionCount, submitting, isLocked, token, selectedIds, gallery, mutate]);

  const handleDownloadZip = useCallback(async () => {
    if (activeSelectedPhotos.length === 0 || downloadProgress.active) return;
    
    setDownloadProgress({ active: true, current: 0, total: activeSelectedPhotos.length });
    const zip = new JSZip();
    
    try {
      await Promise.all(activeSelectedPhotos.map(async (photo) => {
        const res = await fetch(`/api/public/gallery/${token}/photos/${photo.id}/download`);
        const data = await res.json();
        const url = data.success && data.data?.downloadUrl ? data.data.downloadUrl : photo.url;
        
        const imageRes = await fetch(url);
        const blob = await imageRes.blob();
        
        zip.file(photo.filename, blob);
        setDownloadProgress(prev => ({ ...prev, current: prev.current + 1 }));
      }));
      
      const content = await zip.generateAsync({ type: 'blob' });
      saveAs(content, `${gallery?.namaProject || 'gallery'}-selected-photos.zip`);
    } catch (err) {
      console.error('Error creating ZIP:', err);
      toast.error('Gagal mengunduh ZIP. Silakan coba lagi.');
    } finally {
      setDownloadProgress({ active: false, current: 0, total: 0 });
    }
  }, [activeSelectedPhotos, token, gallery, downloadProgress.active]);

  const handleDownloadSingle = useCallback(async (photoId: string, filename: string, urlFallback: string) => {
    try {
      const res = await fetch(`/api/public/gallery/${token}/photos/${photoId}/download`);
      const data = await res.json();
      const url = data.success && data.data?.downloadUrl ? data.data.downloadUrl : urlFallback;
      
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.target = '_blank';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error('Error downloading photo:', err);
      toast.error('Gagal mengunduh foto.');
    }
  }, [token]);

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

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Memuat galeri…</p>
        </div>
      </div>
    );
  }

  if (error || !gallery) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="text-center">
          <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl">📷</span>
          </div>
          <h2 className="text-xl font-semibold text-foreground mb-2">Galeri tidak ditemukan</h2>
          <p className="text-muted-foreground">Link galeri tidak valid</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background" ref={containerRef}>
      {showSuccess && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true" aria-label="Success dialog">
          <div className="bg-card rounded-xl max-w-sm w-full p-8 text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl text-green-600">✓</span>
            </div>
            <h2 className="text-xl font-bold text-foreground mb-2">Pilihan Dikirim!</h2>
            <p className="text-muted-foreground text-sm mb-4">Terima kasih. Fotografer akan memproses pilihan Anda.</p>
            {gallery.thankYouMessage && (
              <p className="text-sm italic text-muted-foreground bg-background p-3 rounded-lg mb-4">&quot;{gallery.thankYouMessage}&quot;</p>
            )}
            <button onClick={() => setShowSuccess(false)} className="w-full py-2 bg-primary/100 text-white rounded-lg hover:bg-primary/80">
              Tutup
            </button>
          </div>
        </div>
      )}

      <header className="sticky top-0 bg-card border-b border-border z-30">
        <div className="px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="font-bold text-foreground">{gallery.namaProject}</h1>
            <span className="text-xs text-muted-foreground flex items-center gap-2">
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
              <button onClick={handleSubmit} disabled={submitting} className="hidden md:block px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors">
                {submitting ? 'Mengirim…' : `Kirim (${localSelectionCount})`}
              </button>
            )}
            {hasPickspace && isLocked && (
              <span className="px-3 py-1.5 bg-green-500/20 border border-green-500/30 text-green-400 text-xs font-medium rounded-full flex items-center gap-1 shadow-[0_0_10px_rgb(34_197_94_/_0.2)]">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
                Pilihan Dikunci
              </span>
            )}
          </div>
        </div>
        {hasPickspace && !isLocked && localSelectionCount > 0 && (
          <div className="px-4 pb-3">
            <div className="flex items-center gap-3">
              <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all ${isMaxed ? 'bg-red-500' : 'bg-primary/100'}`} style={{ width: `${Math.min((localSelectionCount / maxSelection) * 100, 100)}%` }} />
              </div>
              <span className={`text-xs font-semibold ${isMaxed ? 'text-red-500' : 'text-foreground'}`}>
                {localSelectionCount} dari {maxSelection} foto dipilih
              </span>
            </div>
          </div>
        )}
      </header>

      {hasBanner && (
        <div className="mx-4 mt-4 bg-card rounded-lg p-4 border border-border">
          <div className="flex justify-between items-start">
            <div className="text-center flex-1">
              {gallery.bannerClientName && (
                <p className="text-xs font-medium uppercase tracking-wider text-primary">{gallery.bannerClientName}</p>
              )}
              {bannerOpen && (
                <>
                  {gallery.welcomeMessage && <p className="text-sm text-muted-foreground mt-1">{gallery.welcomeMessage}</p>}
                  {gallery.bannerEventDate && <p className="text-xs text-slate-400 mt-1">{gallery.bannerEventDate}</p>}
                </>
              )}
            </div>
            <button onClick={() => setBannerOpen(!bannerOpen)} className="text-slate-400 hover:text-muted-foreground" aria-label={bannerOpen ? 'Tutup banner' : 'Buka banner'}>
              {bannerOpen ? '▲' : '▼'}
            </button>
          </div>
        </div>
      )}

      {hasPickspace && (
        <div className="mx-4 mt-3 flex gap-1 bg-card rounded-lg p-1 border border-border">
          <button onClick={() => setActiveTab('all')} className={`flex-1 py-2.5 text-sm font-medium rounded-md transition-colors ${activeTab === 'all' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-background hover:text-foreground'}`}>
            Semua Foto
          </button>
          <button onClick={() => setActiveTab('selected')} className={`flex-1 py-2.5 text-sm font-medium rounded-md transition-colors ${activeTab === 'selected' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-background hover:text-foreground'}`}>
            Terpilih ({activeSelectionCount})
          </button>
        </div>
      )}

      <main className="p-4">
        {photos.length === 0 ? (
          <div className="text-center py-16"><p className="text-muted-foreground">Belum ada foto</p></div>
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
                      <LazyImage
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
                        className={`absolute top-3 right-3 w-8 h-8 rounded-full border-2 flex items-center justify-center text-sm transition-all shadow-md ${isSelected ? 'bg-primary border-primary text-primary-foreground shadow-[0_0_10px_rgb(224_155_61_/_0.5)] scale-110' : canSelect ? 'bg-black/40 border-white/50 text-transparent hover:border-white hover:text-white hover:bg-black/60 backdrop-blur-sm' : 'bg-muted/80 border-muted-foreground/30 text-transparent cursor-not-allowed'}`}
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path></svg>
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
                  className="px-6 py-3 bg-primary/100 text-white rounded-lg font-medium hover:bg-primary/80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
                <p className="text-muted-foreground">{isLocked ? 'Tidak ada foto terpilih' : 'Belum ada foto dipilih'}</p>
                {!isLocked && <button onClick={() => setActiveTab('all')} className="text-primary text-sm mt-2">← Lihat semua foto</button>}
              </div>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  {activeSelectedPhotos.length} foto terpilih
                  {!isLocked && isMaxed && <span className="text-red-500 font-medium"> (Kuota penuh)</span>}
                  {!isLocked && !isMaxed && <span> • Maks. {maxSelection}</span>}
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {activeSelectedPhotos.map((photo, idx) => {
                    const originalIndex = photos.findIndex((p) => p.id === photo.id);
                    return (
                      <div key={photo.id} className="relative aspect-square rounded-lg overflow-hidden bg-muted cursor-pointer">
                        <LazyImage
                          src={photo.thumbnailUrl || photo.url}
                          alt={photo.filename}
                          fill
                          className="object-cover"
                          onClick={() => openLightbox(originalIndex)}
                        />
                        <span className="absolute top-2 left-2 bg-primary/100 text-white text-xs px-2 py-1 rounded">{idx + 1}</span>
                        {!isLocked && (
                          <button
                            onClick={() => toggleSelect(photo.id)}
                            className="absolute top-2 right-2 bg-red-500 text-white text-xs px-2 py-1 rounded hover:bg-red-600"
                          >
                            ✕
                          </button>
                        )}
                        {gallery.enableDownload && (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDownloadSingle(photo.id, photo.filename, photo.url); }}
                            className="absolute bottom-2 right-2 bg-black/60 text-white p-2 rounded-full hover:bg-black/80 flex items-center justify-center backdrop-blur-md"
                            title="Download foto"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                              <polyline points="7 10 12 15 17 10"></polyline>
                              <line x1="12" y1="15" x2="12" y2="3"></line>
                            </svg>
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
                {isLocked ? (
                  <div className="mt-4 flex gap-2">
                    {gallery.enableDownload && activeSelectedPhotos.length > 0 && (
                      <button onClick={handleDownloadZip} disabled={downloadProgress.active} className="flex-1 py-3 bg-muted text-foreground rounded-lg text-sm font-medium hover:bg-muted disabled:opacity-50 flex justify-center items-center gap-2">
                        {downloadProgress.active ? (
                          <>
                            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                            </svg>
                            Memproses ZIP ({downloadProgress.current}/{downloadProgress.total})
                          </>
                        ) : (
                          '↓ Download Semua (ZIP)'
                        )}
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="mt-4 flex gap-2">
                    <button onClick={selectAll} disabled={isMaxed} className="flex-1 py-3 bg-muted text-foreground rounded-lg text-sm font-medium hover:bg-muted disabled:opacity-50">Pilih Semua</button>
                    {localSelectionCount > 0 && <button onClick={clearAll} className="flex-1 py-3 border border-red-200 text-red-600 rounded-lg text-sm font-medium hover:bg-red-50">Hapus Semua</button>}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </main>

      <footer className="py-6 pb-28 text-center text-xs text-muted-foreground">© {new Date().getFullYear()} PhotoStudio</footer>

      {hasPickspace && !isLocked && localSelectionCount > 0 && (
        <div className="md:hidden fixed bottom-0 left-0 right-0 p-4 bg-background/80 backdrop-blur-xl border-t border-border z-40 transform transition-transform duration-300">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-semibold text-foreground">
              {localSelectionCount} dari {maxSelection} dipilih
            </span>
            <span className={`text-xs ${isMaxed ? 'text-red-500 font-medium' : 'text-muted-foreground'}`}>
              {isMaxed ? 'Kuota penuh' : 'Bisa tambah lagi'}
            </span>
          </div>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="w-full py-3.5 bg-primary text-primary-foreground font-semibold rounded-xl hover:bg-primary/90 disabled:opacity-50 flex justify-center items-center gap-2 shadow-[0_0_15px_rgb(224_155_61_/_0.3)] transition-all"
          >
            {submitting ? (
              <>
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Mengirim...
              </>
            ) : (
              'Kirim Hasil Seleksi'
            )}
          </button>
        </div>
      )}

      <YARLightbox
        open={lightboxIndex >= 0}
        close={closeLightbox}
        index={lightboxIndex >= 0 ? lightboxIndex : 0}
        on={{ view: ({ index }) => setLightboxIndex(index) }}
        slides={photos.map((p) => ({ src: p.url, alt: p.filename }))}
        plugins={[Zoom]}
        carousel={{ finite: false }}
        toolbar={{
          buttons: [
            ...(gallery?.enableDownload && photos[lightboxIndex] ? [
              <button
                key="download-button"
                type="button"
                aria-label="Download foto"
                onClick={(e) => { e.stopPropagation(); handleDownloadSingle(photos[lightboxIndex].id, photos[lightboxIndex].filename, photos[lightboxIndex].url); }}
                className="mr-2 px-3 py-1.5 rounded-full text-sm font-semibold transition-all border bg-black/50 text-white border-white/50 hover:bg-white/20 flex items-center gap-2"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                <span className="hidden sm:inline">Download</span>
              </button>
            ] : []),
            ...(hasPickspace && !isLocked && photos[lightboxIndex] ? [
              <button
                key="select-button"
                type="button"
                aria-label="Pilih foto"
                onClick={(e) => { e.stopPropagation(); toggleSelect(photos[lightboxIndex].id); }}
                className={`mr-4 px-4 py-1.5 rounded-full text-sm font-semibold transition-all border ${
                  selectedIds.has(photos[lightboxIndex].id)
                    ? 'bg-primary text-primary-foreground border-primary shadow-[0_0_15px_rgb(224_155_61_/_0.5)]'
                    : 'bg-black/50 text-white border-white/50 hover:bg-white/20'
                }`}
              >
                {selectedIds.has(photos[lightboxIndex].id) ? '✓ Terpilih' : 'Pilih Foto'}
              </button>
            ] : []),
            "close",
          ],
        }}
      />
    </div>
  );
}