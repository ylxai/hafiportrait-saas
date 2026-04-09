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
  publicId: string | null;
  width: number | null;
  height: number | null;
  order: number | null;
};

type Selection = {
  id: string;
  submittedAt: string;
  photos: { photoId: string }[];
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
  photos: Photo[];
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
      mutate();
    } catch (error) {
      console.error('Error deleting photo:', error);
    }
  }, [galleryId, mutate]);
  
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
        mutate(); // Refresh gallery data
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
    if (!gallery) return;
    if (selectedPhotoIdsForBulk.size === gallery.photos.length) {
      setSelectedPhotoIdsForBulk(new Set());
    } else {
      setSelectedPhotoIdsForBulk(new Set(gallery.photos.map((p) => p.id)));
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
    mutate();
  }, [galleryId, mutate, selectedPhotoIdsForBulk]);

  const exportToTxt = () => {
    const photosToExport = gallery?.photos;

    if (!photosToExport || photosToExport.length === 0) {
      toast.error('Tidak ada foto untuk diekspor');
      return;
    }

    const content = photosToExport.map((p) => p.filename).join('\n');
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${gallery?.namaProject || 'gallery'}-filelist.txt`;
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
  const totalPhotos = gallery?.photos.length || 0;
  const totalPages = Math.ceil(totalPhotos / photosPerPage);
  const paginatedPhotos = gallery?.photos.slice(
    (currentPage - 1) * photosPerPage,
    currentPage * photosPerPage
  ) || [];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500"></div>
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
            <span className="flex items-center gap-1 text-green-500">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
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
              showSelectionView ? 'bg-amber-100 text-amber-800' : 'bg-card border border-border hover:bg-muted text-foreground'
            }`}
          >
            <span>📋</span> Seleksi Client
          </button>
        </div>
      </div>

      {/* Selection View - Admin sees client selections */}
      {showSelectionView && (
        <div className="mb-6 bg-muted border border-amber-200 rounded-xl p-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <h2 className="font-semibold text-slate-900">📋 Seleksi dari Client</h2>
            <button
              onClick={toggleLock}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors border flex items-center gap-2 w-fit ${
                gallery.isSelectionLocked
                  ? 'bg-red-100 text-red-700 border-red-200 hover:bg-red-200'
                  : 'bg-green-100 text-green-700 border-green-200 hover:bg-green-200'
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
                  onClick={exportToTxt}
                  className="px-4 py-2 bg-muted0 text-white rounded-lg hover:bg-amber-600 text-sm"
                >
                  📥 Export .txt (semua foto)
                </button>
              </div>
              
              {/* Selected photos grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2">
                {gallery.photos
                  .filter((p) => selectedPhotoIdsFromServer.includes(p.id))
                  .map((photo, idx) => (
                    <div key={photo.id} className="relative group">
                      <PhotoImage
                        src={photo.url}
                        alt={photo.filename}
                        width={150}
                        height={150}
                        className="w-full h-32 object-cover rounded-lg"
                      />
                      <div className="absolute top-1 left-1 bg-muted0 text-white text-xs px-1.5 py-0.5 rounded">
                        {idx + 1}
                      </div>
                      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition rounded-lg flex items-center justify-center">
                        <span className="text-white text-xs">{photo.filename}</span>
                      </div>
                    </div>
                  ))}
              </div>

              {/* Filename list */}
              <div className="mt-4 p-3 bg-card text-card-foreground rounded-lg">
                <p className="text-xs font-medium text-muted-foreground mb-2">Daftar filename:</p>
                <div className="text-xs text-muted-foreground font-mono max-h-32 overflow-y-auto">
                  {gallery.photos
                    .filter((p) => selectedPhotoIdsFromServer.includes(p.id))
                    .map((p) => p.filename)
                    .join('\n')}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-muted-foreground">Status seleksi saat ini sedang <strong className="text-green-600">Terbuka</strong>. Klien masih dapat mengubah dan mengirimkan pilihan foto.</p>
              {selectedPhotoIdsFromServer.length > 0 && (
                <p className="text-sm font-medium text-amber-600">
                  Pilihan terakhir klien: {selectedPhotoIdsFromServer.length} foto.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Upload Section */}
      <div className="bg-card text-card-foreground rounded-xl border border-champagne-100 p-4 sm:p-6 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <h2 className="font-semibold text-lg text-foreground">Photos ({gallery.photos.length})</h2>
            {gallery.photos.length > 0 && (
              <>
                <button
                  onClick={() => { setBulkMode(!bulkMode); setSelectedPhotoIdsForBulk(new Set()); }}
                  className={`px-3 py-2 sm:py-1 text-sm rounded-lg transition-smooth cursor-pointer border border-border ${
                    bulkMode ? 'bg-green-600/80 text-white border-green-500/50' : 'bg-card text-foreground hover:bg-primary/20 hover:text-primary hover:border-primary/50'
                  }`}
                >
                  {bulkMode ? '✓ Bulk ON' : '☐ Bulk Select'}
                </button>
                {bulkMode && (
                  <button
                    onClick={selectAllPhotos}
                    className="px-3 py-2 sm:py-1 text-sm rounded-lg transition-smooth cursor-pointer border border-border bg-card text-foreground hover:bg-primary/20 hover:text-primary hover:border-primary/50"
                  >
                    {selectedPhotoIdsForBulk.size === gallery.photos.length ? 'Batal Semua' : 'Pilih Semua'}
                  </button>
                )}
                <button
                  onClick={() => setReorderMode(!reorderMode)}
                  className={`px-3 py-2 sm:py-1 text-sm rounded-lg transition-smooth cursor-pointer border border-border ${
                    reorderMode ? 'bg-blue-600/80 text-white border-blue-500/50' : 'bg-card text-foreground hover:bg-blue-500/20 hover:text-blue-400 hover:border-blue-500/50'
                  }`}
                >
                  {reorderMode ? '✓ Reorder ON' : '⇅ Reorder'}
                </button>
              </>
            )}
            {bulkMode && selectedPhotoIdsForBulk.size > 0 && (
              <button
                onClick={deleteSelectedPhotos}
                className="px-3 py-2 sm:py-1 text-sm bg-red-500 text-white rounded-lg hover:bg-red-600 cursor-pointer"
              >
                🗑️ {selectedPhotoIdsForBulk.size}
              </button>
            )}
          </div>
          <Button
            onClick={() => setShowUploadManager(true)}
            className="bg-muted0 hover:bg-amber-600 text-white"
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

        {gallery.photos.length === 0 ? (
          <div className="text-center py-8 sm:py-12 border-2 border-dashed border-champagne-200 rounded-lg">
            <p className="text-muted-foreground">Belum ada foto. Upload foto untuk gallery ini.</p>
          </div>
        ) : (
          <>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-2 sm:gap-3">
            {paginatedPhotos.map((photo, index) => {
              const globalIndex = (currentPage - 1) * photosPerPage + index;
              return (
              <div key={photo.id} className="relative group aspect-square">
                <div 
                  className="w-full h-full cursor-pointer"
                  onClick={() => setLightboxIndex(globalIndex)}
                >
                  <PhotoImage
                    src={photo.url}
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
                      <span className="text-sm font-bold bg-muted0 text-white px-2 py-1 rounded shadow-lg">
                        Order: {photo.order || globalIndex + 1}
                      </span>
                      <input
                        type="number"
                        defaultValue={photo.order || globalIndex + 1}
                        onBlur={(e) => handleReorderPhoto(photo.id, parseInt(e.target.value) || 0)}
                        className="w-16 px-2 py-1 text-center font-bold text-black border-2 border-white rounded shadow-lg"
                        min="1"
                      />
                    </div>
                  </div>
                )}
                {/* Selection indicator from Client */}
                {!bulkMode && !reorderMode && selectedPhotoIdsFromServer.includes(photo.id) && (
                  <div className="absolute bottom-2 right-2 w-6 h-6 bg-green-500 rounded-full flex items-center justify-center text-white text-xs shadow-md pointer-events-none">
                    ✓
                  </div>
                )}
                {!bulkMode && !reorderMode && (
                  <button
                    onClick={(e) => { e.stopPropagation(); deletePhoto(photo.id); }}
                    aria-label={`Hapus ${photo.filename}`}
                    className="absolute top-2 right-2 z-10 w-8 h-8 bg-red-500 rounded-full flex items-center justify-center text-white text-sm opacity-0 group-hover:opacity-100 transition-smooth shadow-md cursor-pointer hover:scale-110"
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
        slides={gallery?.photos?.map(p => ({ src: p.url })) || []}
        plugins={[Zoom]}
        controller={{ closeOnBackdropClick: true }}
        styles={{
          container: { backgroundColor: "rgba(0, 0, 0, 0.9)", backdropFilter: "blur(10px)" }
        }}
      />

      {/* Settings */}
      <div className="bg-card/50 backdrop-blur-xl border border-border shadow-[0_4px_24px_rgba(0,0,0,0.2)] rounded-3xl p-4 sm:p-6">
        <h2 className="font-semibold text-lg text-foreground mb-4">Pengaturan Gallery</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Max Selection</label>
            <input
              type="number"
              value={gallerySettings.maxSelection}
              onChange={(e) => setGallerySettings(prev => ({ ...prev, maxSelection: parseInt(e.target.value) || 20 }))}
              className="w-full px-4 py-2 border border-border rounded-lg focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
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
            onClick={handleSaveSettings}
            disabled={isSavingSettings}
            className="px-4 py-2 bg-muted0 text-white rounded-lg hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {isSavingSettings ? 'Saving...' : 'Save Settings'}
          </button>
          {settingsMessage && (
            <span className={`text-sm ${settingsMessage.includes('success') ? 'text-green-600' : 'text-red-600'}`}>
              {settingsMessage}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}