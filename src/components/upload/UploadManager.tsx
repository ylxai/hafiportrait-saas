'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
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
  const [selectedCloudinary, setSelectedCloudinary] = useState<string>('');
  const [selectedR2, setSelectedR2] = useState<string>('');
  const [showStorageSelection, setShowStorageSelection] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [invalidFiles, setInvalidFiles] = useState<{ filename: string; reason: string }[]>([]);

  const {
    files,
    isUploading,
    errors,
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
    r2AccountId: selectedR2, // Pass selected R2 account
    maxConcurrent: 10,
    maxRetries: 3,
    autoUpload: true,
    onComplete: (photo) => {
      console.log('Photo uploaded:', photo);
    },
    onError: (fileId, error, errorCode) => {
      console.error('Upload error:', error, errorCode);
    },
    onInvalidFile: (filename, reason) => {
      setInvalidFiles(prev => [...prev, { filename, reason }]);
      // Auto hide after 5 seconds
      setTimeout(() => {
        setInvalidFiles(prev => prev.filter(f => f.filename !== filename));
      }, 5000);
    },
  });

  // Retry all failed files
  const retryAllFailed = useCallback(() => {
    files.forEach(file => {
      if (file.status === 'failed') {
        retryFile(file.id);
      }
    });
  }, [files, retryFile]);

  // Set default accounts
  useEffect(() => {
    const defaultCloudinary = cloudinaryAccounts.find(a => a.isDefault);
    const defaultR2 = r2Accounts.find(a => a.isDefault);
    
    if (defaultCloudinary) setSelectedCloudinary(defaultCloudinary.id);
    if (defaultR2) setSelectedR2(defaultR2.id);
  }, [cloudinaryAccounts, r2Accounts]);

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
    }
  }, [addFiles]);

  const handleStartUpload = async () => {
    // Set storage accounts untuk upload hook
    // (Ini akan di-pass ke API saat upload)
    await startUpload();
  };

  const handleClose = () => {
    if (isUploading) {
      if (!confirm('Upload masih berjalan. Yakin ingin menutup?')) {
        return;
      }
    }
    clearFiles();
    clearErrors();
    setInvalidFiles([]);
    onClose();
  };

  const getStatusIcon = (file: UploadFile) => {
    switch (file.status) {
      case 'completed':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'failed':
        return <AlertCircle className="w-5 h-5 text-red-500" />;
      case 'uploading':
      case 'processing':
        return <Loader2 className="w-5 h-5 text-amber-500 animate-spin" />;
      case 'compressing':
        return <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />;
      default:
        // Show retry indicator if file is waiting for retry
        if (file.retryCount > 0 && file.error) {
          return <Loader2 className="w-5 h-5 text-amber-400 animate-spin" />;
        }
        return <div className="w-5 h-5 rounded-full border-2 border-slate-300" />;
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
      default:
        // Show retry info if there's an error message (during auto-retry)
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
            <div>
              <label className="text-sm font-medium text-slate-700 mb-2 block">
                Cloudinary Account (Thumbnail)
              </label>
              <Select value={selectedCloudinary} onValueChange={(value) => setSelectedCloudinary(value || '')}>
                <SelectTrigger>
                  <SelectValue placeholder="Pilih Cloudinary account..." />
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
              <label className="text-sm font-medium text-slate-700 mb-2 block">
                R2 Account (Original File)
              </label>
              <Select value={selectedR2} onValueChange={(value) => setSelectedR2(value || '')}>
                <SelectTrigger>
                  <SelectValue placeholder="Pilih R2 account..." />
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

            <div className="bg-slate-50 p-3 rounded-lg text-sm text-slate-600">
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
              className="bg-amber-500 hover:bg-amber-600"
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
        <div className="flex items-center justify-between bg-slate-50 px-3 py-2 rounded-lg text-sm">
          <div className="flex items-center gap-4">
            <span className="text-slate-600">
              Cloudinary: <strong>{cloudinaryAccounts.find(a => a.id === selectedCloudinary)?.name}</strong>
            </span>
            <span className="text-slate-600">
              R2: <strong>{r2Accounts.find(a => a.id === selectedR2)?.name}</strong>
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
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-center gap-2 text-red-700 font-medium mb-2">
              <AlertCircle className="w-5 h-5" />
              File yang tidak valid ({invalidFiles.length})
            </div>
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {invalidFiles.map((file, idx) => (
                <div key={idx} className="text-sm text-red-600">
                  <span className="font-medium">{file.filename}:</span> {file.reason}
                </div>
              ))}
            </div>
            <p className="text-xs text-red-500 mt-2">
              Format yang didukung: JPG, JPEG, PNG, WebP, HEIC, NEF, CR2, ARW, DNG, RAW (Max 50MB)
            </p>
          </div>
        )}

        {/* Drop Zone */}
        {files.length === 0 && (
          <div
            ref={dropZoneRef}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
              isDragging 
                ? 'border-amber-500 bg-amber-50' 
                : 'border-slate-300 hover:border-slate-400'
            }`}
          >
            <ImageIcon className="w-12 h-12 text-slate-400 mx-auto mb-4" />
            <p className="text-slate-600 mb-2">
              Drag & drop foto di sini, atau{' '}
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="text-amber-600 hover:underline"
              >
                pilih file
              </button>
            </p>
            <p className="text-sm text-slate-500">
              Format: JPG, PNG, WebP, HEIC, RAW (NEF, CR2, ARW, DNG) • Max 50MB • Maks 400 file
            </p>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".jpg,.jpeg,.png,.webp,.heic,.nef,.cr2,.arw,.dng,.raw,image/*"
              onChange={handleFileSelect}
              className="hidden"
            />
          </div>
        )}

        {/* File List */}
        {files.length > 0 && (
          <div className="flex-1 overflow-hidden flex flex-col">
            {/* Stats */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-4 text-sm">
                <span className="text-slate-600">
                  Total: <strong>{totalCount}</strong> foto
                </span>
                <span className="text-green-600">
                  Selesai: <strong>{completedCount}</strong>
                </span>
                {failedCount > 0 && (
                  <span className="text-red-600">
                    Gagal: <strong>{failedCount}</strong>
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-slate-600">
                  {Math.round(progress)}%
                </span>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={clearFiles}
                  disabled={isUploading}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {/* Progress Bar */}
            <div className="w-full bg-slate-200 rounded-full h-2 mb-4">
              <div 
                className="bg-amber-500 h-2 rounded-full transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>

            {/* File List */}
            <div className="flex-1 overflow-y-auto space-y-2 max-h-[300px]">
              {files.map((file) => (
                <div 
                  key={file.id}
                  className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg"
                >
                  {getStatusIcon(file)}
                  
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-700 truncate">
                      {file.file.name}
                    </p>
                    <p className="text-xs text-slate-500">
                      {formatFileSize(file.file.size)} • {getStatusText(file)}
                      {file.error && file.status === 'failed' && ` • ${file.error}`}
                    </p>
                  </div>

                  {file.status === 'failed' && (
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => retryFile(file.id)}
                    >
                      Retry
                    </Button>
                  )}

                  {(file.status === 'pending' || file.status === 'failed') && (
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => removeFile(file.id)}
                      disabled={isUploading && file.status !== 'failed'}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>

            {/* Add More Files */}
            {!isUploading && (
              <div className="mt-4 flex justify-center">
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="image/*"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <Button 
                  variant="outline" 
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="w-4 h-4 mr-2" />
                  Tambah Foto
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={handleClose}>
            {isUploading ? 'Tutup (Lanjut Background)' : 'Batal'}
          </Button>
          
          {files.length > 0 && !isUploading && failedCount > 0 && (
            <Button 
              variant="outline"
              onClick={retryAllFailed}
              className="border-amber-500 text-amber-600 hover:bg-amber-50"
            >
              Retry {failedCount} Gagal
            </Button>
          )}
          
          {files.length > 0 && !isUploading && completedCount < totalCount && (
            <Button 
              onClick={handleStartUpload}
              disabled={files.every(f => f.status !== 'pending')}
              className="bg-amber-500 hover:bg-amber-600"
            >
              Start Upload
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
