'use client';

import { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Image from 'next/image';
import useSWR from 'swr';
import { useSelectionSubscription, useAblyConnection } from '@/lib/hooks/useAbly';

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
  
  const [uploading, setUploading] = useState(false);
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<Set<string>>(new Set());
  const [selectedPhotoIdsForBulk, setSelectedPhotoIdsForBulk] = useState<Set<string>>(new Set());
  const [bulkMode, setBulkMode] = useState(false);
  const [showSelectionView, setShowSelectionView] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetcher = (url: string) => fetch(url).then((res) => res.json());
  const { data, isLoading, mutate } = useSWR<{ gallery: Gallery }>(
    galleryId ? `/api/admin/galleries/${galleryId}` : null,
    fetcher
  );
  
  const gallery = data?.gallery ?? null;

  const handleSelectionUpdate = useCallback((update: { photoId: string; action: 'add' | 'remove'; selectionCount: number }) => {
    mutate();
  }, [mutate]);

  const isAblyConnected = useAblyConnection();
  useSelectionSubscription(gallery?.id || '', handleSelectionUpdate);

  const { data: storageData } = useSWR<{ accounts: StorageAccount[] }>(
    '/api/admin/storage-accounts',
    fetcher
  );

  const cloudinaryAccounts = useMemo(
    () => storageData?.accounts?.filter((a) => a.provider === 'CLOUDINARY') ?? [],
    [storageData]
  );
  const r2Accounts = useMemo(
    () => storageData?.accounts?.filter((a) => a.provider === 'R2') ?? [],
    [storageData]
  );

  const [selectedCloudinaryAccount, setSelectedCloudinaryAccount] = useState<string>('');
  const [selectedR2Account, setSelectedR2Account] = useState<string>('');
  const [uploadProgress, setUploadProgress] = useState<{ total: number; completed: number; failed: number } | null>(null);
  const [uploadQueue, setUploadQueue] = useState<{ name: string; status: 'pending' | 'uploading' | 'success' | 'failed' }[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  const MAX_CONCURRENT_UPLOADS = 4;
  const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

  const uploadFile = useCallback(async (file: File, galleryId: string, cloudinaryId: string | null, r2Id: string | null) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('galleryId', galleryId);
    if (cloudinaryId) formData.append('cloudinaryAccountId', cloudinaryId);
    if (r2Id) formData.append('r2AccountId', r2Id);

    const res = await fetch(`/api/admin/galleries/${galleryId}/photos`, {
      method: 'POST',
      body: formData,
    });

    if (!res.ok) {
      throw new Error(`Failed to upload ${file.name}`);
    }
    const data = await res.json();
    return { filename: file.name, url: data.photo.url };
  }, []);

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const fileArray = Array.from(files);
    
    // Validate file sizes
    const oversizedFiles = fileArray.filter(f => f.size > MAX_FILE_SIZE);
    if (oversizedFiles.length > 0) {
      alert(`File terlalu besar (maks 50MB): ${oversizedFiles.map(f => f.name).join(', ')}`);
      return;
    }

    setUploading(true);
    setUploadProgress({ total: fileArray.length, completed: 0, failed: 0 });
    setUploadQueue(fileArray.map(f => ({ name: f.name, status: 'pending' as const })));

    const cloudinaryId = selectedCloudinaryAccount || null;
    const r2Id = selectedR2Account || null;

    // Process in batches
    for (let i = 0; i < fileArray.length; i += MAX_CONCURRENT_UPLOADS) {
      const batch = fileArray.slice(i, i + MAX_CONCURRENT_UPLOADS);
      
      // Update batch status to uploading
      setUploadQueue(prev => prev.map((item, idx) => 
        idx >= i && idx < i + MAX_CONCURRENT_UPLOADS 
          ? { ...item, status: 'uploading' } 
          : item
      ));

      const batchResults = await Promise.allSettled(
        batch.map((file) => uploadFile(file, galleryId, cloudinaryId, r2Id))
      );

      batchResults.forEach((result, idx) => {
        const fileIdx = i + idx;
        if (result.status === 'fulfilled') {
          setUploadProgress((prev) => prev ? { ...prev, completed: prev.completed + 1 } : null);
          setUploadQueue(prev => prev.map((item, idx) => 
            idx === fileIdx ? { ...item, status: 'success' } : item
          ));
        } else {
          console.error('Upload failed:', result.reason);
          setUploadProgress((prev) => prev ? { ...prev, failed: prev.failed + 1 } : null);
          setUploadQueue(prev => prev.map((item, idx) => 
            idx === fileIdx ? { ...item, status: 'failed' } : item
          ));
        }
      });
    }

    setUploading(false);
    setTimeout(() => {
      setUploadProgress(null);
      setUploadQueue([]);
    }, 2000);
    mutate();

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [galleryId, mutate, selectedCloudinaryAccount, selectedR2Account, uploadFile, MAX_FILE_SIZE]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      const dt = new DataTransfer();
      Array.from(files).forEach(f => {
        if (f.type.startsWith('image/')) {
          dt.items.add(f);
        }
      });
      if (dt.files.length > 0) {
        const fakeEvent: React.ChangeEvent<HTMLInputElement> = {
          target: { files: dt.files },
        } as unknown as React.ChangeEvent<HTMLInputElement>;
        handleFileSelect(fakeEvent);
      }
    }
  }, [handleFileSelect]);

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

    setUploading(true);
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
    setUploading(false);
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
            <h1 className="text-2xl font-bold text-gray-900">{gallery.namaProject}</h1>
            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
              gallery.status === 'published' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
            }`}>
              {gallery.status}
            </span>
          </div>
          <p className="text-sm text-gray-500 mt-1 flex items-center gap-2">
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
              showSelectionView ? 'bg-amber-500 text-white' : 'bg-gray-100 text-gray-700'
            }`}
          >
            👁️ Lihat Seleksi Client
          </button>
        </div>
      </div>

      {/* Selection View - Admin sees client selections */}
      {showSelectionView && (
        <div className="mb-6 bg-amber-50 border border-amber-200 rounded-xl p-4">
          <h2 className="font-semibold text-gray-900 mb-3">📋 Seleksi dari Client</h2>
          {gallery.isSelectionLocked ? (
            <div>
              <p className="text-sm text-gray-600 mb-3">
                Client telah memilih <span className="font-bold text-amber-600">{selectedPhotoIdsFromServer.length}</span> foto
                {gallery.maxSelection > 0 && ` (maks. ${gallery.maxSelection})`}
              </p>
              <div className="flex gap-2 mb-4">
                <button
                  onClick={exportToTxt}
                  className="px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 text-sm"
                >
                  📥 Export .txt (semua foto)
                </button>
                {selectedPhotoIds.size > 0 && (
                  <button
                    onClick={exportToTxt}
                    className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm"
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
                      <Image
                        src={photo.url}
                        alt={photo.filename}
                        width={150}
                        height={150}
                        className="w-full h-32 object-cover rounded-lg"
                      />
                      <div className="absolute top-1 left-1 bg-amber-500 text-white text-xs px-1.5 py-0.5 rounded">
                        {idx + 1}
                      </div>
                      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition rounded-lg flex items-center justify-center">
                        <span className="text-white text-xs">{photo.filename}</span>
                      </div>
                    </div>
                  ))}
              </div>

              {/* Filename list */}
              <div className="mt-4 p-3 bg-white rounded-lg">
                <p className="text-xs font-medium text-gray-500 mb-2">Daftar filename:</p>
                <div className="text-xs text-gray-600 font-mono max-h-32 overflow-y-auto">
                  {gallery.photos
                    .filter((p) => selectedPhotoIdsFromServer.includes(p.id))
                    .map((p) => p.filename)
                    .join('\n')}
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-500">Belum ada seleksi dari client</p>
          )}
        </div>
      )}

      {/* Upload Section */}
      <div 
        className={`bg-white rounded-xl border-2 border-dashed p-4 sm:p-6 mb-6 transition-colors ${
          isDragging ? 'border-champagne-500 bg-champagne-50' : 'border-champagne-100'
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <h2 className="font-semibold text-lg text-charcoal">Photos ({gallery.photos.length})</h2>
            {gallery.photos.length > 0 && (
              <button
                onClick={() => { setBulkMode(!bulkMode); setSelectedPhotoIdsForBulk(new Set()); }}
                className={`px-3 py-2 sm:py-1 text-sm rounded-lg transition-smooth cursor-pointer ${
                  bulkMode ? 'bg-champagne-500 text-white' : 'bg-champagne-100 text-champagne-700 hover:bg-champagne-200'
                }`}
              >
                {bulkMode ? '✓ Bulk ON' : '☐ Bulk Select'}
              </button>
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
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
            {/* Account Selection - Stack on mobile */}
            <div className="flex flex-col sm:flex-row gap-2">
              <select
                value={selectedCloudinaryAccount}
                onChange={(e) => setSelectedCloudinaryAccount(e.target.value)}
                className="text-sm border border-champagne-200 rounded-lg px-3 py-2 min-h-[44px]"
              >
                <option value="">Cloudinary: Default</option>
                {cloudinaryAccounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>{acc.name}</option>
                ))}
              </select>
              <select
                value={selectedR2Account}
                onChange={(e) => setSelectedR2Account(e.target.value)}
                className="text-sm border border-champagne-200 rounded-lg px-3 py-2 min-h-[44px]"
              >
                <option value="">R2: Default</option>
                {r2Accounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>{acc.name}</option>
                ))}
              </select>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*"
              onChange={handleFileSelect}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="px-4 py-3 sm:py-2 bg-champagne-500 text-white rounded-lg hover:bg-champagne-600 disabled:opacity-50 cursor-pointer min-h-[44px]"
            >
              {uploading ? 'Mengunggah...' : '+ Upload'}
            </button>
          </div>
        </div>

        {/* Drag hint */}
        <div className="text-center text-sm text-warm-gray mb-4">
          💡 Drag & drop or click to upload
        </div>

        {/* Upload Progress */}
        {uploadProgress && (
          <div className="mb-4 p-3 bg-amber-50 rounded-lg">
            <div className="flex items-center justify-between text-sm mb-2">
              <span className="text-gray-600">
                Mengunggah {uploadProgress.completed}/{uploadProgress.total} foto...
              </span>
              {uploadProgress.failed > 0 && (
                <span className="text-red-500">Gagal: {uploadProgress.failed}</span>
              )}
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-amber-500 h-2 rounded-full transition-all"
                style={{ width: `${(uploadProgress.completed / uploadProgress.total) * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* File Queue */}
        {uploadQueue.length > 0 && (
          <div className="mb-4 text-sm">
            <div className="font-medium text-gray-600 mb-2">Status Upload:</div>
            <div className="max-h-40 overflow-y-auto space-y-1">
              {uploadQueue.map((item, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  {item.status === 'pending' && <span className="text-gray-400">⏳</span>}
                  {item.status === 'uploading' && <span className="text-amber-500 animate-spin">⏳</span>}
                  {item.status === 'success' && <span className="text-green-500">✓</span>}
                  {item.status === 'failed' && <span className="text-red-500">✕</span>}
                  <span className="text-gray-600 truncate">{item.name}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {gallery.photos.length === 0 ? (
          <div className="text-center py-8 sm:py-12 border-2 border-dashed border-champagne-200 rounded-lg">
            <p className="text-warm-gray">Belum ada foto. Upload foto untuk gallery ini.</p>
          </div>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2 sm:gap-3">
            {gallery.photos.map((photo) => (
              <div key={photo.id} className="relative group aspect-square">
                {bulkMode && (
                  <input
                    type="checkbox"
                    checked={selectedPhotoIdsForBulk.has(photo.id)}
                    onChange={() => toggleBulkSelect(photo.id)}
                    className="absolute top-2 left-2 z-10 w-5 h-5 rounded cursor-pointer"
                  />
                )}
                <Image
                  src={photo.url}
                  alt={photo.filename}
                  fill
                  sizes="(max-width: 640px) 33vw, (max-width: 768px) 25vw, (max-width: 1024px) 16vw, 12vw"
                  className="object-cover rounded-lg"
                />
                {/* Selection indicator */}
                {selectedPhotoIdsFromServer.includes(photo.id) && (
                  <div className="absolute top-1 right-1 w-5 h-5 sm:w-6 sm:h-6 bg-champagne-500 rounded-full flex items-center justify-center text-white text-xs">
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
      <div className="glass-card p-4 sm:p-6">
        <h2 className="font-semibold text-lg text-charcoal mb-4">Pengaturan Gallery</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Max Selection</label>
            <input
              type="number"
              defaultValue={gallery.maxSelection}
              className="w-full px-4 py-2 border border-gray-200 rounded-lg"
              placeholder="20"
            />
          </div>
          <div className="flex items-center gap-2 mt-6">
            <input
              type="checkbox"
              id="enableDownload"
              defaultChecked={gallery.enableDownload}
              className="rounded border-gray-300"
            />
            <label htmlFor="enableDownload" className="text-sm text-gray-700">
              Izinkan client download
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}