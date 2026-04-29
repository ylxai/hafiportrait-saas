'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import { useParams } from 'next/navigation';
import useSWR from 'swr';
import { useSelectionSubscription, useAblyConnection } from '@/lib/hooks/useAbly';
import { UploadManager } from '@/components/upload/UploadManager';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Upload } from 'lucide-react';
import { PhotoImage } from '@/components/photo/PhotoImage';
import YARLightbox from "yet-another-react-lightbox";
import Zoom from "yet-another-react-lightbox/plugins/zoom";
import "yet-another-react-lightbox/styles.css";
import { ChevronLeft, ChevronRight } from 'lucide-react';

type StorageAccount = {
  id: string;
  name: string;
  provider: 'CLOUDINARY' | 'R2';
  isDefault: boolean;
};

type Photo = {
  id: string;
  filename: string;
  url: string;
  thumbnailUrl?: string;
  publicId: string | null;
  width: number | null;
  height: number | null;
  order: number | null;
};

type Selection = {
  id: string;
  submittedAt: string;
  photos: { photoId: string; photo: Photo }[];
};

type Gallery = {
  id: string;
  namaProject: string;
  clientToken: string;
  status: string;
  maxSelection: number;
  enableDownload: boolean;
  welcomeMessage: string | null;
  thankYouMessage: string | null;
  bannerClientName: string | null;
  bannerEventDate: string | null;
  isSelectionLocked: boolean;
  viewCount: number;
  event: { kodeBooking: string; client: { nama: string } };
  selections: Selection[];
};

export default function GalleryDetailPage() {
  const params = useParams();
  const galleryId = params.id as string;
  
  const [selectedPhotoIdsForBulk, setSelectedPhotoIdsForBulk] = useState<Set<string>>(new Set());
  const [bulkMode, setBulkMode] = useState(false);
  const [showSelectionView, setShowSelectionView] = useState(false);
  const [showUploadManager, setShowUploadManager] = useState(false);
  const [reorderMode, setReorderMode] = useState(false);
  const [, setIsReordering] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(-1);
  const [currentPage, setCurrentPage] = useState(1);
  const photosPerPage = 50;
  
  // Gallery settings state
  const [gallerySettings, setGallerySettings] = useState({
    maxSelection: 20,
    enableDownload: false,
  });
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [settingsMessage, setSettingsMessage] = useState('');

  const fetcher = (url: string) => fetch(url).then((res) => res.json());
  const { data, isLoading, mutate } = useSWR<{ data: { gallery: Gallery } }>(
    galleryId ? `/api/admin/galleries/${galleryId}` : null,
    fetcher
  );
  
  const gallery = data?.data?.gallery ?? null;

  const { data: photosRes, isLoading: photosLoading, mutate: mutatePhotos } = useSWR<{ data: { photos: Photo[], pagination: { total: number, pages: number } } }>(
    galleryId ? `/api/admin/galleries/${galleryId}/photos?page=${currentPage}&limit=${photosPerPage}` : null,
    fetcher
  );
  const photos = photosRes?.data?.photos || [];
  const pagination = photosRes?.data?.pagination;
  
  // Update settings state when gallery data loads
  useEffect(() => {
    if (gallery) {
      setGallerySettings({
        maxSelection: gallery.maxSelection || 20,
        enableDownload: gallery.enableDownload || false,
      });
    }
  }, [gallery]);

  const handleSelectionUpdate = useCallback((_update: { photoId: string; action: 'add' | 'remove'; selectionCount: number }) => {
    mutate();
  }, [mutate]);

  const _isAblyConnected = useAblyConnection();
  useSelectionSubscription(gallery?.id || '', handleSelectionUpdate);

  const { data: storageData } = useSWR<{ data: { accounts: StorageAccount[] } }>(
    '/api/admin/storage-accounts',
    fetcher
  );

  const cloudinaryAccounts = useMemo(
    () => storageData?.data?.accounts?.filter((a) => a.provider === 'CLOUDINARY') ?? [],
    [storageData]
  );
  const r2Accounts = useMemo(
    () => storageData?.data?.accounts?.filter((a) => a.provider === 'R2') ?? [],
    [storageData]
  );

  const deletePhoto = useCallback(async (photoId: string) => {
    if (!confirm('Hapus foto ini?')) return;

    try {
      await fetch(`/api/admin/galleries/${galleryId}/photos/${photoId}`, {
        method: 'DELETE',
      });
      mutatePhotos();
    } catch (error) {
      console.error('Error deleting photo:', error);
    }
  }, [galleryId, mutatePhotos]);
  
  // Save gallery settings
  const handleSaveSettings = async () => {
    if (!gallery) return;
    
    setIsSavingSettings(true);
    setSettingsMessage('');
    
    try {
      const response = await fetch(`/api/admin/galleries/${galleryId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          maxSelection: gallerySettings.maxSelection,
          enableDownload: gallerySettings.enableDownload,
        }),
      });
      
      if (response.ok) {
        setSettingsMessage('Settings saved successfully!');
        mutate(); // Refresh gallery data
        setTimeout(() => setSettingsMessage(''), 3000);
      } else {
        setSettingsMessage('Failed to save settings');
      }
    } catch (error) {
      console.error('Error saving settings:', error);
      setSettingsMessage('Error saving settings');
    } finally {
      setIsSavingSettings(false);
    }
  };
  
  // Reorder photo
  const handleReorderPhoto = async (photoId: string, newOrder: number) => {
    setIsReordering(true);
    
    try {
      const response = await fetch(`/api/admin/galleries/${galleryId}/photos/${photoId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order: newOrder }),
      });
      
      if (response.ok) {
        mutatePhotos(); // Refresh photos
      } else {
        console.error('Failed to reorder photo');
      }
    } catch (error) {
      console.error('Error reordering photo:', error);
    } finally {
      setIsReordering(false);
    }
  };


  const toggleBulkSelect = (photoId: string) => {
    setSelectedPhotoIdsForBulk((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(photoId)) {
        newSet.delete(photoId);
      } else {
        newSet.add(photoId);
      }
      return newSet;
    });
  };

  const selectAllPhotos = () => {
    if (!photos) return;
    if (selectedPhotoIdsForBulk.size === photos.length) {
      setSelectedPhotoIdsForBulk(new Set());
    } else {
      setSelectedPhotoIdsForBulk(new Set(photos.map((p) => p.id)));
    }
  };

  const deleteSelectedPhotos = useCallback(async () => {
    if (!confirm(`Hapus ${selectedPhotoIdsForBulk.size} foto yang dipilih?`)) return;

    try {
      const response = await fetch(`/api/admin/galleries/${galleryId}/photos/bulk`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          photoIds: Array.from(selectedPhotoIdsForBulk),
        }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to bulk delete photos');
      }
    } catch (error) {
      console.error('Error bulk deleting photos:', error);
      toast.error('Terjadi kesalahan saat menghapus foto');
    }

    setSelectedPhotoIdsForBulk(new Set());
    setBulkMode(false);
    mutatePhotos();
  }, [galleryId, mutatePhotos, selectedPhotoIdsForBulk]);

  const handleExport = () => {
    // Only exports actual selection file names
    const photosToExport = latestSelection?.photos?.map((p) => p.photo) || [];
    if (photosToExport.length === 0) {
      toast.error('Tidak ada foto seleksi klien untuk diekspor');
      return;
    }
    const content = photosToExport.map((p) => p.filename).join('\n');
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${gallery?.namaProject || 'gallery'}-selection-filelist.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const toggleLock = async () => {
    try {
      const res = await fetch(`/api/admin/galleries/${galleryId}/toggle-lock`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isSelectionLocked: !gallery?.isSelectionLocked }),
      });
      if (res.ok) {
        mutate();
      } else {
        toast.error('Gagal mengubah status kunci galeri');
      }
    } catch (error) {
      console.error(error);
      toast.error('Terjadi kesalahan');
    }
  };

  // Get selected photos from latest selection
  const latestSelection = gallery?.selections[0];
  const selectedPhotoIdsFromServer = latestSelection?.photos.map((p) => p.photoId) || [];

  // Pagination logic
  const totalPhotos = pagination?.total || 0;
  const totalPages = pagination?.pages || 0;
  const paginatedPhotos = photos;

  if (isLoading || photosLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!gallery) {
    return <div>Gallery tidak ditemukan</div>;
  }

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-foreground">{gallery.namaProject}</h1>
            <span className={`px-2 py-1 rounded-full text-[10px] uppercase font-bold tracking-wider ${
              gallery.status === 'published' ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'
            }`}>
              {gallery.status}
            </span>
          </div>
          <p className="text-sm text-muted-foreground mt-2 flex flex-wrap items-center gap-2">
            <span className="font-medium text-foreground">{gallery.event.client.nama}</span> 
            <span className="text-border">•</span> 
            {gallery.event.kodeBooking} 
            <span className="text-border">•</span> 
            <span className="flex items-center gap-1">
              👁️ {gallery.viewCount} views
            </span>
            <span className="text-border">•</span> 
            <span className="flex items-center gap-1 text-primary">
              <span className="w-2 h-2 rounded-full bg-primary animate-pulse"></span>
              Live
            </span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2 w-full sm:w-auto mt-2 sm:mt-0">
          <a
            href={`/gallery/${gallery.clientToken}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 sm:flex-none text-center px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-xl hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
          >
            <span>🔗</span> Link Galeri
          </a>
          <button
            onClick={() => setShowSelectionView(!showSelectionView)}
            className={`flex-1 sm:flex-none px-4 py-2 text-sm font-medium rounded-xl transition-colors flex items-center justify-center gap-2 ${
              showSelectionView ? 'bg-primary text-primary-foreground' : 'bg-card border border-border hover:bg-muted text-foreground'
            }`}
          >
            <span>📋</span> Seleksi Client
          </button>
        </div>
      </div>

      {/* Selection View - Admin sees client selections */}
      {showSelectionView && (
        <div className="mb-6 bg-muted border border-border rounded-xl p-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <h2 className="font-semibold text-foreground">📋 Seleksi dari Client</h2>
            <button
              onClick={toggleLock}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors border flex items-center gap-2 w-fit ${
                gallery.isSelectionLocked
                  ? 'bg-destructive/10 text-destructive border-destructive/20 hover:bg-destructive/20'
                  : 'bg-primary/10 text-primary border-primary/20 hover:bg-primary/20'
              }`}
            >
              {gallery.isSelectionLocked ? '🔓 Buka Kunci (Klien bisa memilih lagi)' : '🔒 Kunci Seleksi (Klien tidak bisa memilih)'}
            </button>
          </div>
          {gallery.isSelectionLocked ? (
            <div>
              <p className="text-sm text-muted-foreground mb-3">
                Client telah memilih <span className="font-bold text-primary">{selectedPhotoIdsFromServer.length}</span> foto
                {gallery.maxSelection > 0 && ` (maks. ${gallery.maxSelection})`}
              </p>
              <div className="flex gap-2 mb-4">
                <button
                  onClick={handleExport}
                  className="px-4 py-2 bg-muted text-foreground rounded-lg hover:bg-primary/20 hover:text-primary text-sm"
                >
                  📥 Export .txt (foto seleksi)
                </button>
              </div>
              
              {/* Selected photos grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2">
                {latestSelection?.photos?.map((item, idx) => {
                    const photo = item.photo;
                    return (
                    <div key={photo.id} className="relative group">
                      <PhotoImage
                        src={photo.thumbnailUrl || photo.url}
                        alt={photo.filename}
                        width={150}
                        height={150}
                        className="w-full h-32 object-cover rounded-lg"
                      />
                      <div className="absolute top-1 left-1 bg-foreground text-background text-xs px-1.5 py-0.5 rounded">
                        {idx + 1}
                      </div>
                      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition rounded-lg flex items-center justify-center">
                        <span className="text-white text-xs">{photo.filename}</span>
                      </div>
                    </div>
                    );
                  })}
              </div>

              {/* Filename list */}
              <div className="mt-4 p-3 bg-card text-card-foreground rounded-lg">
                <p className="text-xs font-medium text-muted-foreground mb-2">Daftar filename:</p>
                <div className="text-xs text-muted-foreground font-mono max-h-32 overflow-y-auto">
                  {latestSelection?.photos?.map((item) => item.photo.filename)
                    .join('\n')}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-muted-foreground">Status seleksi saat ini sedang <strong className="text-primary">Terbuka</strong>. Klien masih dapat mengubah dan mengirimkan pilihan foto.</p>
              {selectedPhotoIdsFromServer.length > 0 && (
                <p className="text-sm font-medium text-primary">
                  Pilihan terakhir klien: {selectedPhotoIdsFromServer.length} foto.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Upload Section */}
      <div className="bg-card text-card-foreground rounded-xl border border-border p-4 sm:p-6 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <h2 className="font-semibold text-lg text-foreground">Photos ({totalPhotos})</h2>
            {totalPhotos > 0 && (
              <>
                <button
                  onClick={() => { setBulkMode(!bulkMode); setSelectedPhotoIdsForBulk(new Set()); }}
                  className={`px-3 py-2 sm:py-1 text-sm rounded-lg transition-smooth cursor-pointer border border-border ${
                    bulkMode ? 'bg-primary text-primary-foreground border-primary/50' : 'bg-card text-foreground hover:bg-primary/20 hover:text-primary hover:border-primary/50'
                  }`}
                >
                  {bulkMode ? '✓ Bulk ON' : '☐ Bulk Select'}
                </button>
                {bulkMode && (
                  <button
                    onClick={selectAllPhotos}
                    className="px-3 py-2 sm:py-1 text-sm rounded-lg transition-smooth cursor-pointer border border-border bg-card text-foreground hover:bg-primary/20 hover:text-primary hover:border-primary/50"
                  >
                    {selectedPhotoIdsForBulk.size === photos.length ? 'Batal Semua' : 'Pilih Semua'}
                  </button>
                )}
                <button
                  onClick={() => setReorderMode(!reorderMode)}
                  className={`px-3 py-2 sm:py-1 text-sm rounded-lg transition-smooth cursor-pointer border border-border ${
                    reorderMode ? 'bg-accent text-accent-foreground border-accent/50' : 'bg-card text-foreground hover:bg-accent/20 hover:text-accent-foreground hover:border-accent/50'
                  }`}
                >
                  {reorderMode ? '✓ Reorder ON' : '⇅ Reorder'}
                </button>
              </>
            )}
            {bulkMode && selectedPhotoIdsForBulk.size > 0 && (
              <button
                onClick={deleteSelectedPhotos}
                className="px-3 py-2 sm:py-1 text-sm bg-destructive text-destructive-foreground rounded-lg hover:bg-destructive/90 cursor-pointer"
              >
                🗑️ {selectedPhotoIdsForBulk.size}
              </button>
            )}
          </div>
          <Button
            onClick={() => setShowUploadManager(true)}
            className="bg-primary hover:bg-primary/90 text-primary-foreground"
          >
            <Upload className="w-4 h-4 mr-2" />
            Upload Foto
          </Button>
        </div>

        {/* Upload Manager Modal */}
        <UploadManager
          galleryId={galleryId}
          galleryName={gallery?.namaProject || ''}
          clientName={gallery?.event?.client?.nama || ''}
          isOpen={showUploadManager}
          onClose={() => setShowUploadManager(false)}
          onSuccess={() => {
            mutate();
            setShowUploadManager(false);
          }}
          cloudinaryAccounts={cloudinaryAccounts}
          r2Accounts={r2Accounts}
        />

        {photos.length === 0 ? (
          <div className="text-center py-8 sm:py-12 border-2 border-dashed border-border rounded-lg">
            <p className="text-muted-foreground">Belum ada foto. Upload foto untuk gallery ini.</p>
          </div>
        ) : (
          <>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-2 sm:gap-3">
            {paginatedPhotos.map((photo, index) => {
              const localIndex = index;
              return (
              <div key={photo.id} className="relative group aspect-square">
                <div 
                  className="w-full h-full cursor-pointer"
                  onClick={() => setLightboxIndex(localIndex)}
                >
                  <PhotoImage
                    src={photo.thumbnailUrl || photo.url}
                    alt={photo.filename}
                    fill
                    sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, (max-width: 1024px) 20vw, 12vw"
                    className="object-cover rounded-lg"
                  />
                </div>
                {bulkMode && (
                  <div 
                    className="absolute inset-0 z-10 flex items-start justify-start p-2 cursor-pointer"
                    onClick={(e) => { e.stopPropagation(); toggleBulkSelect(photo.id); }}
                  >
                    <input
                      type="checkbox"
                      checked={selectedPhotoIdsForBulk.has(photo.id)}
                      readOnly
                      className="w-6 h-6 rounded border-2 border-white shadow-md cursor-pointer pointer-events-none"
                    />
                  </div>
                )}
                {reorderMode && (
                  <div 
                    className="absolute inset-0 z-10 bg-black/40 flex items-center justify-center p-2 cursor-pointer"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex flex-col items-center gap-2">
                      <span className="text-sm font-bold bg-muted text-foreground px-2 py-1 rounded shadow-lg">
                        Order: {photo.order || (currentPage - 1) * photosPerPage + localIndex + 1}
                      </span>
                      <input
                        type="number"
                        defaultValue={photo.order || (currentPage - 1) * photosPerPage + localIndex + 1}
                        onBlur={(e) => { void handleReorderPhoto(photo.id, parseInt(e.target.value, 10) || 0); }}
                        className="w-16 px-2 py-1 text-center font-bold text-background bg-foreground border-2 border-border rounded shadow-lg"
                        min="1"
                      />
                    </div>
                  </div>
                )}
                {/* Selection indicator from Client */}
                {!bulkMode && !reorderMode && selectedPhotoIdsFromServer.includes(photo.id) && (
                  <div className="absolute bottom-2 right-2 w-6 h-6 bg-primary rounded-full flex items-center justify-center text-primary-foreground text-xs shadow-md pointer-events-none">
                    ✓
                  </div>
                )}
                {!bulkMode && !reorderMode && (
                  <button
                    onClick={(e) => { e.stopPropagation(); deletePhoto(photo.id); }}
                    aria-label={`Hapus ${photo.filename}`}
                    className="absolute top-2 right-2 z-10 w-8 h-8 bg-destructive rounded-full flex items-center justify-center text-destructive-foreground text-sm opacity-0 group-hover:opacity-100 transition-smooth shadow-md cursor-pointer hover:scale-110"
                  >
                    ✕
                  </button>
                )}
                {!bulkMode && !reorderMode && (
                  <div className="absolute bottom-0 left-0 right-0 bg-black/60 p-1 text-white text-xs truncate rounded-b-lg opacity-0 group-hover:opacity-100 transition-smooth pointer-events-none text-center">
                    {photo.filename}
                  </div>
                )}
              </div>
            )})}
          </div>

          {totalPages > 1 && (
            <div className="mt-8 flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-border pt-4">
              <div className="text-sm text-muted-foreground">
                Menampilkan {(currentPage - 1) * photosPerPage + 1} - {Math.min(currentPage * photosPerPage, totalPhotos)} dari {totalPhotos} foto
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="h-8 border-border text-foreground hover:bg-muted"
                >
                  <ChevronLeft className="h-4 w-4 mr-1" /> Prev
                </Button>
                <div className="flex items-center gap-1 overflow-x-auto max-w-[200px] sm:max-w-none no-scrollbar">
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let pageNum;
                    if (totalPages <= 5) pageNum = i + 1;
                    else if (currentPage <= 3) pageNum = i + 1;
                    else if (currentPage >= totalPages - 2) pageNum = totalPages - 4 + i;
                    else pageNum = currentPage - 2 + i;
                    
                    return (
                      <button
                        key={pageNum}
                        onClick={() => setCurrentPage(pageNum)}
                        className={`min-w-8 h-8 px-2 flex items-center justify-center rounded-lg text-sm transition-colors ${
                          currentPage === pageNum 
                            ? 'bg-primary text-primary-foreground font-medium' 
                            : 'hover:bg-muted text-muted-foreground'
                        }`}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="h-8 border-border text-foreground hover:bg-muted"
                >
                  Next <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          )}
          </>
        )}
      </div>

      <YARLightbox
        open={lightboxIndex >= 0}
        index={lightboxIndex >= 0 ? lightboxIndex : 0}
        close={() => setLightboxIndex(-1)}
        slides={photos?.map((p, idx) => {
          // Use thumbnailUrl (Cloudinary) instead of url (R2 private)
          const imageUrl = p.thumbnailUrl || p.url || '';
          if (!imageUrl) {
            console.error(`[Lightbox] Photo ${idx} has no URL:`, p);
          }
          return { 
            src: imageUrl,
            alt: p.filename,
            width: p.width || 1200,
            height: p.height || 800,
          };
        }) || []}
        plugins={[Zoom]}
        controller={{ closeOnBackdropClick: true }}
        styles={{
          container: { backgroundColor: "rgba(0, 0, 0, 0.9)", backdropFilter: "blur(10px)" }
        }}
        on={{ 
          click: () => console.log('[Lightbox] Clicked'),
          view: (index) => console.log('[Lightbox] Viewing index:', index),
        }}
      />

      {/* Settings */}
      <div className="bg-card/50 backdrop-blur-xl border border-border shadow-2xl rounded-3xl p-4 sm:p-6">
        <h2 className="font-semibold text-lg text-foreground mb-4">Pengaturan Gallery</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Max Selection</label>
            <input
              type="number"
              value={gallerySettings.maxSelection}
              onChange={(e) => { setGallerySettings(prev => ({ ...prev, maxSelection: parseInt(e.target.value, 10) || 20 })); }}
              className="w-full px-4 py-2 border border-border rounded-lg focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 bg-background text-foreground"
              placeholder="20"
            />
          </div>
          <div className="flex items-center gap-2 mt-6">
            <input
              type="checkbox"
              id="enableDownload"
              checked={gallerySettings.enableDownload}
              onChange={(e) => setGallerySettings(prev => ({ ...prev, enableDownload: e.target.checked }))}
              className="rounded border-border"
            />
            <label htmlFor="enableDownload" className="text-sm text-foreground">
              Izinkan client download
            </label>
          </div>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={() => { void handleSaveSettings(); }}
            disabled={isSavingSettings}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {isSavingSettings ? 'Saving...' : 'Save Settings'}
          </button>
          {settingsMessage && (
            <span className={`text-sm ${settingsMessage.includes('success') ? 'text-primary' : 'text-destructive'}`}>
              {settingsMessage}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}