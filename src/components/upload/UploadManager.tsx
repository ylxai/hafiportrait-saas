'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import Link from 'next/link';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useDirectUpload, UploadFile } from '@/hooks/useDirectUpload';
import { Loader2, Upload, X, CheckCircle, AlertCircle, Image as ImageIcon } from 'lucide-react';
import { formatFileSize } from '@/lib/utils';

interface StorageAccount {
  id: string;
  name: string;
  provider: 'CLOUDINARY' | 'R2';
  isDefault: boolean;
}

interface UploadManagerProps {
  galleryId: string;
  galleryName: string;
  clientName: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  cloudinaryAccounts: StorageAccount[];
  r2Accounts: StorageAccount[];
}

const STORAGE_KEY_CLOUDINARY = 'upload-storage-cloudinary';
const STORAGE_KEY_R2 = 'upload-storage-r2';

function getStoredValue(key: string): string {
  try {
    return localStorage.getItem(key) ?? '';
  } catch {
    return '';
  }
}

function setStoredValue(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Silently fail (private browsing, quota exceeded)
  }
}

export function UploadManager({
  galleryId,
  galleryName,
  clientName,
  isOpen,
  onClose,
  onSuccess,
  cloudinaryAccounts,
  r2Accounts,
}: UploadManagerProps) {
  const [selectedCloudinary, setSelectedCloudinary] = useState<string>(() => getStoredValue(STORAGE_KEY_CLOUDINARY));
  const [selectedR2, setSelectedR2] = useState<string>(() => getStoredValue(STORAGE_KEY_R2));
  const [showStorageSelection, setShowStorageSelection] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [invalidFiles, setInvalidFiles] = useState<{ filename: string; reason: string }[]>([]);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const invalidTimers = useRef<Map<string, NodeJS.Timeout>>(new Map());

  const {
    files,
    isUploading,
    addFiles,
    removeFile,
    startUpload,
    retryFile,
    clearFiles,
    clearErrors,
    completedCount,
    failedCount,
    totalCount,
    progress,
  } = useDirectUpload({
    galleryId,
    r2AccountId: selectedR2,
    cloudinaryAccountId: selectedCloudinary,
    maxConcurrent: 10,
    maxRetries: 3,
    autoUpload: false,
    onComplete: (photo) => {
      console.log('Photo uploaded:', photo);
    },
    onError: (_fileId, error, errorCode) => {
      console.error('Upload error:', error, errorCode);
    },
    onInvalidFile: (filename, reason) => {
      setInvalidFiles(prev => {
        const filtered = prev.filter(f => f.filename !== filename);
        return [...filtered, { filename, reason }];
      });

      if (invalidTimers.current.has(filename)) {
        clearTimeout(invalidTimers.current.get(filename));
      }

      const timer = setTimeout(() => {
        setInvalidFiles(prev => prev.filter(f => f.filename !== filename));
        invalidTimers.current.delete(filename);
      }, 5000);
      invalidTimers.current.set(filename, timer);
    },
  });

  // Cleanup invalid file timers on unmount
  useEffect(() => {
    const timers = invalidTimers.current;
    return () => {
      timers.forEach(timer => clearTimeout(timer));
      timers.clear();
    };
  }, []);

  // Track upload completion for success state display
  const uploadFinished = !isUploading && totalCount > 0 && completedCount === totalCount && failedCount === 0;

  // Retry all failed files
  const retryAllFailed = useCallback(() => {
    files.forEach(file => {
      if (file.status === 'failed') {
        retryFile(file.id);
      }
    });
  }, [files, retryFile]);

  // Set default accounts and validate selected IDs still exist
  useEffect(() => {
    // Skip validation until accounts are loaded from API
    if (cloudinaryAccounts.length === 0 && r2Accounts.length === 0) return;

    if (!selectedCloudinary || !cloudinaryAccounts.some(a => a.id === selectedCloudinary)) {
      const defaultCloudinary = cloudinaryAccounts.find(a => a.isDefault) ?? cloudinaryAccounts[0];
      setSelectedCloudinary(defaultCloudinary?.id ?? '');
    }
    if (!selectedR2 || !r2Accounts.some(a => a.id === selectedR2)) {
      const defaultR2 = r2Accounts.find(a => a.isDefault) ?? r2Accounts[0];
      setSelectedR2(defaultR2?.id ?? '');
    }
  }, [cloudinaryAccounts, r2Accounts, selectedCloudinary, selectedR2]);

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
    const droppedFiles = e.dataTransfer.files;
    if (droppedFiles.length > 0) {
      addFiles(droppedFiles);
    }
  }, [addFiles]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      addFiles(e.target.files);
      // Reset input value so same file can be re-selected
      e.target.value = '';
    }
  }, [addFiles]);

  const handleStartUpload = async () => {
    await startUpload();
  };

  const handleClose = () => {
    if (isUploading) {
      setShowCloseConfirm(true);
      return;
    }
    if (uploadFinished) {
      onSuccess();
    }
    clearFiles();
    clearErrors();
    setInvalidFiles([]);
    onClose();
  };

  const confirmClose = () => {
    setShowCloseConfirm(false);
    clearFiles();
    clearErrors();
    setInvalidFiles([]);
    onClose();
  };

  const handleUploadAgain = () => {
    clearFiles();
    clearErrors();
  };

  const handleDone = () => {
    onSuccess();
    clearFiles();
    clearErrors();
    setInvalidFiles([]);
    onClose();
  };

  const getStatusIcon = (file: UploadFile) => {
    switch (file.status) {
      case 'completed':
        return <CheckCircle className="w-5 h-5 text-success" />;
      case 'failed':
        return <AlertCircle className="w-5 h-5 text-destructive" />;
      case 'uploading':
      case 'processing':
      case 'compressing':
        return <Loader2 className="w-5 h-5 text-primary animate-spin" />;
      case 'retrying':
        return <Loader2 className="w-5 h-5 text-warning animate-spin" />;
      default:
        if (file.retryCount > 0 && file.error) {
          return <Loader2 className="w-5 h-5 text-warning animate-spin" />;
        }
        return <div className="w-5 h-5 rounded-full border-2 border-border" />;
    }
  };

  const getStatusText = (file: UploadFile) => {
    switch (file.status) {
      case 'completed':
        return 'Selesai';
      case 'failed':
        return 'Gagal';
      case 'uploading':
        return 'Mengupload...';
      case 'processing':
        return 'Memproses...';
      case 'compressing':
        return 'Mengompres...';
      case 'retrying':
        return file.error || 'Mencoba ulang...';
      default:
        if (file.error && file.retryCount > 0) {
          return file.error;
        }
        return 'Menunggu';
    }
  };

  // Step 1: Storage Selection
  if (showStorageSelection) {
    return (
      <Dialog open={isOpen} onOpenChange={handleClose}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Pilih Storage Account</DialogTitle>
            <DialogDescription>
              Pilih Cloudinary dan R2 account untuk upload foto.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {cloudinaryAccounts.length === 0 || r2Accounts.length === 0 ? (
              <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 text-sm text-destructive">
                <AlertCircle className="w-4 h-4 inline mr-2" />
                Storage account belum dikonfigurasi.{' '}
                <Link href="/admin/storage" className="underline font-medium hover:text-destructive">
                  Tambahkan di Settings → Storage
                </Link>.
              </div>
            ) : (
              <>
                <div>
                  <label htmlFor="cloudinary-select" className="text-sm font-medium text-foreground mb-2 block">
                    Cloudinary Account (Thumbnail)
                  </label>
                  <Select value={selectedCloudinary} onValueChange={(value) => { setSelectedCloudinary(value || ''); setStoredValue(STORAGE_KEY_CLOUDINARY, value || ''); }}>
                    <SelectTrigger id="cloudinary-select">
                      <SelectValue placeholder="Pilih Cloudinary account...">
                        {(value: string | null) => {
                          if (!value) return null;
                          const account = cloudinaryAccounts.find((a) => a.id === value);
                          return account ? `${account.name}${account.isDefault ? ' (Default)' : ''}` : value;
                        }}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {cloudinaryAccounts.map((account) => (
                        <SelectItem key={account.id} value={account.id}>
                          {account.name} {account.isDefault && '(Default)'}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label htmlFor="r2-select" className="text-sm font-medium text-foreground mb-2 block">
                    R2 Account (Original File)
                  </label>
                  <Select value={selectedR2} onValueChange={(value) => { setSelectedR2(value || ''); setStoredValue(STORAGE_KEY_R2, value || ''); }}>
                    <SelectTrigger id="r2-select">
                      <SelectValue placeholder="Pilih R2 account...">
                        {(value: string | null) => {
                          if (!value) return null;
                          const account = r2Accounts.find((a) => a.id === value);
                          return account ? `${account.name}${account.isDefault ? ' (Default)' : ''}` : value;
                        }}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {r2Accounts.map((account) => (
                        <SelectItem key={account.id} value={account.id}>
                          {account.name} {account.isDefault && '(Default)'}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}

            <div className="bg-muted p-3 rounded-lg text-sm text-muted-foreground">
              <p className="font-medium mb-1">Info Gallery:</p>
              <p>Project: {galleryName}</p>
              <p>Client: {clientName}</p>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={handleClose}>
              Batal
            </Button>
            <Button
              onClick={() => setShowStorageSelection(false)}
              disabled={!selectedCloudinary || !selectedR2}
              className="bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              Lanjutkan
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // Step 2: File Upload
  return (
    <>
      <Dialog open={isOpen} onOpenChange={handleClose}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="w-5 h-5" />
              Upload Foto
            </DialogTitle>
            <DialogDescription>
              Upload foto ke gallery <strong>{galleryName}</strong> ({clientName})
            </DialogDescription>
          </DialogHeader>

          {/* Storage Info */}
          <div className="flex items-center justify-between bg-muted px-3 py-2 rounded-lg text-sm">
            <div className="flex items-center gap-4">
              <span className="text-muted-foreground">
                Cloudinary: <strong>{cloudinaryAccounts.find(a => a.id === selectedCloudinary)?.name ?? '—'}</strong>
              </span>
              <span className="text-muted-foreground">
                R2: <strong>{r2Accounts.find(a => a.id === selectedR2)?.name ?? '—'}</strong>
              </span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowStorageSelection(true)}
              disabled={isUploading}
            >
              Ubah
            </Button>
          </div>

          {/* Invalid Files Alert */}
          {invalidFiles.length > 0 && (
            <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
              <div className="flex items-center gap-2 text-destructive font-medium mb-2">
                <AlertCircle className="w-5 h-5" />
                File yang tidak valid ({invalidFiles.length})
              </div>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {invalidFiles.map((file) => (
                  <div key={`${file.filename}-${file.reason}`} className="text-sm text-destructive">
                    <span className="font-medium">{file.filename}:</span> {file.reason}
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Format yang didukung: JPG, JPEG, PNG, WebP, HEIC, NEF, CR2, ARW, DNG, RAW (Max 50MB)
              </p>
            </div>
          )}

          {/* Success State */}
          {uploadFinished && (
            <div className="flex flex-col items-center py-8 gap-4">
              <CheckCircle className="w-16 h-16 text-success" />
              <div className="text-center">
                <p className="text-lg font-semibold text-foreground">Upload Selesai!</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {completedCount} foto berhasil diupload ke gallery.
                </p>
              </div>
              <div className="flex gap-3">
                <Button variant="outline" onClick={handleUploadAgain}>
                  <Upload className="w-4 h-4 mr-2" />
                  Upload Lagi
                </Button>
                <Button onClick={handleDone} className="bg-primary hover:bg-primary/90 text-primary-foreground">
                  Selesai
                </Button>
              </div>
            </div>
          )}

          {/* Drop Zone - show when no files or all completed (handled by success state above) */}
          {files.length === 0 && !uploadFinished && (
            <div
              ref={dropZoneRef}
              role="button"
              tabIndex={0}
              aria-label="Drop zone untuk upload foto"
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  fileInputRef.current?.click();
                }
              }}
              className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer ${
                isDragging
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-muted-foreground'
              }`}
            >
              <ImageIcon className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground mb-2">
                Drag & drop foto di sini, atau{' '}
                <span className="text-primary hover:underline">
                  pilih file
                </span>
              </p>
              <p className="text-sm text-muted-foreground">
                Format: JPG, PNG, WebP, HEIC, RAW (NEF, CR2, ARW, DNG) • Max 50MB • Maks 400 file
              </p>
            </div>
          )}

          {/* File List - show when uploading or has pending/failed files */}
          {files.length > 0 && !uploadFinished && (
            <div className="flex-1 overflow-hidden flex flex-col">
              {/* Stats */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-4 text-sm" aria-live="polite">
                  <span className="text-muted-foreground">
                    Total: <strong>{totalCount}</strong> foto
                  </span>
                  <span className="text-success">
                    Selesai: <strong>{completedCount}</strong>
                  </span>
                  {failedCount > 0 && (
                    <span className="text-destructive">
                      Gagal: <strong>{failedCount}</strong>
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">
                    {Math.round(progress)}%
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearFiles}
                    disabled={isUploading}
                    aria-label="Hapus semua file dari antrian"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="w-full bg-muted rounded-full h-2 mb-4" role="progressbar" aria-valuenow={Math.round(progress)} aria-valuemin={0} aria-valuemax={100}>
                <div
                  className="bg-primary h-2 rounded-full transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>

              {/* File List */}
              <div className="flex-1 overflow-y-auto space-y-2 max-h-[300px]">
                {files.map((file) => (
                  <div
                    key={file.id}
                    className="flex items-center gap-3 p-3 bg-muted rounded-lg"
                  >
                    {getStatusIcon(file)}

                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">
                        {file.file.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatFileSize(file.file.size)} • {getStatusText(file)}
                        {file.error && file.status === 'failed' && ` • ${file.error}`}
                      </p>
                    </div>

                    {file.status === 'failed' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => retryFile(file.id)}
                        aria-label={`Retry upload ${file.file.name}`}
                      >
                        Retry
                      </Button>
                    )}

                    {(file.status === 'uploading' || file.status === 'processing') && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeFile(file.id)}
                        aria-label={`Batalkan upload ${file.file.name}`}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    )}

                    {(file.status === 'pending' || file.status === 'failed' || file.status === 'retrying' || file.status === 'compressing') && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeFile(file.id)}
                        aria-label={`Hapus ${file.file.name} dari antrian`}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>

              {/* Compact Drop Zone - always visible when not uploading */}
              {!isUploading && (
                <div
                  role="button"
                  tabIndex={0}
                  aria-label="Tambah foto tambahan"
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      fileInputRef.current?.click();
                    }
                  }}
                  className={`group mt-4 border-2 border-dashed rounded-lg p-3 text-center transition-colors cursor-pointer outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 ${
                    isDragging
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-muted-foreground'
                  }`}
                >
                  <p className="text-sm text-muted-foreground pointer-events-none">
                    <Upload className="size-4 inline mr-2" />
                    Drop foto di sini atau <span className="text-primary group-hover:underline">pilih file</span>
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Footer - only show when not in success state */}
          {!uploadFinished && (
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="outline" onClick={handleClose}>
                {isUploading ? 'Tutup & Batalkan Upload' : 'Batal'}
              </Button>

              {files.length > 0 && !isUploading && failedCount > 0 && (
                <Button
                  variant="outline"
                  onClick={retryAllFailed}
                  className="border-primary text-primary hover:bg-primary/10"
                >
                  Retry {failedCount} Gagal
                </Button>
              )}

              {files.length > 0 && !isUploading && completedCount < totalCount && (
                <Button
                  onClick={handleStartUpload}
                  disabled={files.every(f => f.status !== 'pending')}
                  className="bg-primary hover:bg-primary/90 text-primary-foreground"
                >
                  Start Upload
                </Button>
              )}
            </div>
          )}

          {/* Hidden file input - always rendered */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".jpg,.jpeg,.png,.webp,.heic,.nef,.cr2,.arw,.dng,.raw,image/*"
            onChange={handleFileSelect}
            className="hidden"
            aria-hidden="true"
          />
        </DialogContent>
      </Dialog>

      {/* Close Confirmation Dialog */}
      <Dialog open={showCloseConfirm} onOpenChange={setShowCloseConfirm}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Batalkan Upload?</DialogTitle>
            <DialogDescription>
              Upload masih berjalan. Menutup modal akan membatalkan semua upload yang belum selesai.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCloseConfirm(false)}>
              Lanjutkan Upload
            </Button>
            <Button variant="destructive" onClick={confirmClose}>
              Batalkan & Tutup
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
