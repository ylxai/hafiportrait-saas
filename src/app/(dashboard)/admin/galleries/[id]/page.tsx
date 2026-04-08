'use client';

import { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { useParams } from 'next/navigation';
import useSWR from 'swr';
import { useSelectionSubscription, useAblyConnection } from '@/lib/hooks/useAbly';
import { UploadManager } from '@/components/upload/UploadManager';
import { Button } from '@/components/ui/button';
import { Upload } from 'lucide-react';
import { PhotoImage } from '@/components/photo/PhotoImage';

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
  
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<Set<string>>(new Set());
  const [selectedPhotoIdsForBulk, setSelectedPhotoIdsForBulk] = useState<Set<string>>(new Set());
  const [bulkMode, setBulkMode] = useState(false);
  const [showSelectionView, setShowSelectionView] = useState(false);
  const [showUploadManager, setShowUploadManager] = useState(false);
  const [reorderMode, setReorderMode] = useState(false);
  const [isReordering, setIsReordering] = useState(false);
  
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

  const handleSelectionUpdate = useCallback((update: { photoId: string; action: 'add' | 'remove'; selectionCount: number }) => {
    mutate();
  }, [mutate]);

  const isAblyConnected = useAblyConnection();
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

  const toggleSelectForExport = (photoId: string) => {
    setSelectedPhotoIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(photoId)) {
        newSet.delete(photoId);
      } else {
        newSet.add(photoId);
      }
      return newSet;
    });
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

    for (const photoId of selectedPhotoIdsForBulk) {
      try {
        await fetch(`/api/admin/galleries/${galleryId}/photos/${photoId}`, {
          method: 'DELETE',
        });
      } catch (error) {
        console.error('Error deleting photo:', error);
      }
    }

    setSelectedPhotoIdsForBulk(new Set());
    setBulkMode(false);
    mutate();
  }, [galleryId, mutate, selectedPhotoIdsForBulk]);

  const exportToTxt = () => {
    const photosToExport = selectedPhotoIds.size > 0
      ? gallery?.photos.filter((p) => selectedPhotoIds.has(p.id))
      : gallery?.photos;

    if (!photosToExport || photosToExport.length === 0) {
      alert('Tidak ada foto untuk diekspor');
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

  // Get selected photos from latest selection
  const latestSelection = gallery?.selections[0];
  const selectedPhotoIdsFromServer = latestSelection?.photos.map((p) => p.photoId) || [];

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
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-900">{gallery.namaProject}</h1>
            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
              gallery.status === 'published' ? 'bg-green-100 text-green-800' : 'bg-muted text-muted-foreground'
            }`}>
              {gallery.status}
            </span>
          </div>
          <p className="text-sm text-muted-foreground mt-1 flex items-center gap-2">
            {gallery.event.client.nama} • {gallery.event.kodeBooking} • {gallery.viewCount} views
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-green-500"></span>
              Live
            </span>
          </p>
        </div>
        <div className="flex gap-2">
          <a
            href={`/gallery/${gallery.clientToken}`}
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
          >
            Link Galeri
          </a>
          <button
            onClick={() => setShowSelectionView(!showSelectionView)}
            className={`px-4 py-2 rounded-lg ${
              showSelectionView ? 'bg-muted0 text-white' : 'bg-muted text-foreground'
            }`}
          >
            👁️ Lihat Seleksi Client
          </button>
        </div>
      </div>

      {/* Selection View - Admin sees client selections */}
      {showSelectionView && (
        <div className="mb-6 bg-muted border border-amber-200 rounded-xl p-4">
          <h2 className="font-semibold text-slate-900 mb-3">📋 Seleksi dari Client</h2>
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
                {selectedPhotoIds.size > 0 && (
                  <button
                    onClick={exportToTxt}
                    className="px-4 py-2 bg-muted text-foreground rounded-lg hover:bg-slate-200 text-sm"
                  >
                    📥 Export .txt (terpilih: {selectedPhotoIds.size})
                  </button>
                )}
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
            <p className="text-sm text-muted-foreground">Belum ada seleksi dari client</p>
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
                  className={`px-3 py-2 sm:py-1 text-sm rounded-lg transition-smooth cursor-pointer ${
                    bulkMode ? 'bg-muted0 text-white' : 'bg-primary/20 text-amber-700 hover:bg-amber-200'
                  }`}
                >
                  {bulkMode ? '✓ Bulk ON' : '☐ Bulk Select'}
                </button>
                <button
                  onClick={() => setReorderMode(!reorderMode)}
                  className={`px-3 py-2 sm:py-1 text-sm rounded-lg transition-smooth cursor-pointer ${
                    reorderMode ? 'bg-blue-500 text-white' : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
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
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2 sm:gap-3">
            {gallery.photos.map((photo, index) => (
              <div key={photo.id} className="relative group aspect-square">
                {bulkMode && (
                  <input
                    type="checkbox"
                    checked={selectedPhotoIdsForBulk.has(photo.id)}
                    onChange={() => toggleBulkSelect(photo.id)}
                    className="absolute top-2 left-2 z-10 w-5 h-5 rounded cursor-pointer"
                  />
                )}
                {reorderMode && (
                  <div className="absolute top-2 right-2 z-10 flex items-center gap-1">
                    <span className="text-xs bg-muted0 text-white px-1 rounded">
                      {photo.order || index + 1}
                    </span>
                    <input
                      type="number"
                      defaultValue={photo.order || index + 1}
                      onBlur={(e) => handleReorderPhoto(photo.id, parseInt(e.target.value) || 0)}
                      className="w-12 px-1 py-0.5 text-xs border border-border rounded"
                      min="1"
                    />
                  </div>
                )}
                <PhotoImage
                  src={photo.url}
                  alt={photo.filename}
                  fill
                  sizes="(max-width: 640px) 33vw, (max-width: 768px) 25vw, (max-width: 1024px) 16vw, 12vw"
                  className="object-cover rounded-lg"
                />
                {/* Selection indicator */}
                {selectedPhotoIdsFromServer.includes(photo.id) && (
                  <div className="absolute top-1 right-1 w-5 h-5 sm:w-6 sm:h-6 bg-muted0 rounded-full flex items-center justify-center text-white text-xs">
                    ✓
                  </div>
                )}
                <button
                  onClick={() => deletePhoto(photo.id)}
                  aria-label={`Hapus ${photo.filename}`}
                  className="absolute top-1 left-1 w-5 h-5 sm:w-6 sm:h-6 bg-red-500 rounded-full flex items-center justify-center text-white text-xs opacity-0 group-hover:opacity-100 transition-smooth cursor-pointer"
                >
                  ✕
                </button>
                <div className="absolute bottom-0 left-0 right-0 bg-black/60 p-1 text-white text-xs truncate rounded-b-lg opacity-0 group-hover:opacity-100 transition-smooth">
                  {photo.filename}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

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