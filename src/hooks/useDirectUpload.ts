'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import imageCompression from 'browser-image-compression';
import { toast } from 'sonner';
import {
  MAX_FILE_SIZE_BYTES,
  MAX_FILES_PER_BATCH,
  SMALL_BATCH_THRESHOLD,
  MAX_CONCURRENT_UPLOADS,
  MAX_COMPRESSION_WORKERS,
  MAX_UPLOAD_WORKERS,
  MAX_RETRY_ATTEMPTS,
  RETRY_DELAYS_MS,
  MIN_COMPRESSION_SIZE_BYTES,
  COMPRESSION_MAX_SIZE_MB,
  COMPRESSION_MAX_DIMENSION,
  COMPRESSION_QUALITY,
  COMPRESSION_USE_WEB_WORKER,
  COMPRESSION_PRESERVE_EXIF,
  ALLOWED_EXTENSIONS,
  ALLOWED_MIME_TYPES,
  RAW_FILE_EXTENSIONS,
} from '@/lib/upload/constants';
import { calculateFileHash } from '@/lib/upload/hash-client';

export interface UploadFile {
  id: string;
  file: File;
  compressed?: File;
  fileHash?: string; // SHA-256 hash for integrity/duplicate detection
  status: 'pending' | 'compressing' | 'uploading' | 'processing' | 'completed' | 'failed';
  progress: number;
  error?: string;
  errorCode?: 'INVALID_TYPE' | 'TOO_LARGE' | 'UPLOAD_FAILED' | 'PROCESSING_FAILED' | 'NETWORK_ERROR';
  photoId?: string;
  thumbnailUrl?: string;
  retryCount: number; // Track retry attempts
}

interface UseDirectUploadOptions {
  galleryId: string;
  r2AccountId?: string;
  cloudinaryAccountId?: string; // Selected Cloudinary storage account
  maxConcurrent?: number;
  autoUpload?: boolean;
  maxFileSize?: number; // in bytes, default 50MB
  maxRetries?: number; // Max retry attempts, default 3
  // Compression config (overrides defaults from constants)
  compressionQuality?: number; // 0-1, default 0.8
  compressionMaxSizeMB?: number; // default 10MB
  compressionMaxDimension?: number; // default 4096px
  onProgress?: (completed: number, total: number) => void;
  onComplete?: (photo: { id: string; filename: string; thumbnailUrl?: string }) => void;
  onError?: (fileId: string, error: string, errorCode: UploadFile['errorCode']) => void;
  onInvalidFile?: (filename: string, reason: string) => void;
}

// Error types yang bisa di-retry (temporary errors)
const RETRYABLE_ERROR_CODES: UploadFile['errorCode'][] = ['NETWORK_ERROR', 'UPLOAD_FAILED', 'PROCESSING_FAILED'];

// Validate file type
function validateFileType(file: File): { valid: boolean; error?: string } {
  const extension = '.' + file.name.split('.').pop()?.toLowerCase();
  
  // Check extension
  if (!ALLOWED_EXTENSIONS.includes(extension)) {
    return {
      valid: false,
      error: `Format tidak didukung: ${extension}. Gunakan: ${ALLOWED_EXTENSIONS.join(', ')}`,
    };
  }
  
  // Check MIME type (additional validation)
  if (!ALLOWED_MIME_TYPES.includes(file.type) && !file.type.startsWith('image/')) {
    return {
      valid: false,
      error: `Tipe file tidak valid: ${file.type}`,
    };
  }
  
  return { valid: true };
}

// Format error message untuk user
function formatErrorMessage(error: unknown, context: string): { message: string; code: UploadFile['errorCode'] } {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    
    if (message.includes('network') || message.includes('fetch') || message.includes('abort') || message.includes('timeout')) {
      return { message: 'Gagal terhubung ke server. Periksa koneksi internet.', code: 'NETWORK_ERROR' };
    }
    if (message.includes('413') || message.includes('too large') || message.includes('entity')) {
      return { message: 'File terlalu besar (maks 50MB)', code: 'TOO_LARGE' };
    }
    if (message.includes('r2') || message.includes('upload failed') || message.includes('connection')) {
      return { message: `Gagal upload ke storage: ${error.message}`, code: 'UPLOAD_FAILED' };
    }
    if (message.includes('thumbnail') || message.includes('cloudinary')) {
      return { message: `Gagal generate thumbnail: ${error.message}`, code: 'PROCESSING_FAILED' };
    }
    if (message.includes('invalid') || message.includes('format')) {
      return { message: error.message, code: 'INVALID_TYPE' };
    }
    
    return { message: `${context}: ${error.message}`, code: 'UPLOAD_FAILED' };
  }
  
  return { message: `${context}: Terjadi kesalahan tidak diketahui`, code: 'UPLOAD_FAILED' };
}

// Check if error is retryable
function isRetryableError(errorCode: UploadFile['errorCode']): boolean {
  return RETRYABLE_ERROR_CODES.includes(errorCode);
}

export function useDirectUpload(options: UseDirectUploadOptions) {
  const { 
    galleryId, 
    r2AccountId,
    cloudinaryAccountId, // Selected Cloudinary account
    maxConcurrent = MAX_CONCURRENT_UPLOADS, 
    autoUpload: _autoUpload = true, 
    maxFileSize = MAX_FILE_SIZE_BYTES,
    maxRetries = MAX_RETRY_ATTEMPTS,
    onProgress, 
    onComplete, 
    onError,
    onInvalidFile,
  } = options;
  
  const [files, setFiles] = useState<UploadFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [errors, setErrors] = useState<{ fileId: string; message: string; code: UploadFile['errorCode'] }[]>([]);
  const activeUploads = useRef(0);
  const abortControllers = useRef<Map<string, AbortController>>(new Map());
  const _isAutoUploading = useRef(false);
  const retryTimeouts = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const filesRef = useRef<UploadFile[]>([]); // Track latest files for workers
  const processingIds = useRef<Set<string>>(new Set()); // Track files currently being processed
  
  // Keep filesRef in sync with files state
  filesRef.current = files;

  // HIGH PRIORITY FIX #1: Cleanup retry timeouts on unmount
  useEffect(() => {
    const timeouts = retryTimeouts.current;
    const controllers = abortControllers.current;
    
    return () => {
      timeouts.forEach(timeout => clearTimeout(timeout));
      timeouts.clear();
      controllers.forEach(controller => controller.abort());
      controllers.clear();
    };
  }, []);

  // Compress file sebelum upload
  const compressFile = async (file: File): Promise<File> => {
    // Skip compression untuk file RAW (karena sudah compressed)
    const extension = '.' + file.name.split('.').pop()?.toLowerCase();
    const isRaw = RAW_FILE_EXTENSIONS.includes(extension);
    if (isRaw) return file;
    
    // Skip file kecil
    if (file.size < MIN_COMPRESSION_SIZE_BYTES) return file;

    try {
      return await imageCompression(file, {
        maxSizeMB: options.compressionMaxSizeMB ?? COMPRESSION_MAX_SIZE_MB,
        maxWidthOrHeight: options.compressionMaxDimension ?? COMPRESSION_MAX_DIMENSION,
        useWebWorker: COMPRESSION_USE_WEB_WORKER,
        preserveExif: COMPRESSION_PRESERVE_EXIF,
        initialQuality: options.compressionQuality ?? COMPRESSION_QUALITY,
      });
    } catch (error) {
      console.warn('Compression failed, using original:', error);
      return file;
    }
  };

  // Upload single file via direct R2 dengan retry logic
  const uploadFile = async (uploadFile: UploadFile): Promise<void> => {
    const fileToUpload = uploadFile.compressed || uploadFile.file;
    const abortController = new AbortController();
    abortControllers.current.set(uploadFile.id, abortController);

    try {
      // Step 1: Calculate file hash for integrity verification (only if not already calculated)
      let fileHash = uploadFile.fileHash;
      if (!fileHash) {
        try {
          fileHash = await calculateFileHash(fileToUpload);
          // Save hash to state so it doesn't need to be recalculated on retry
          updateFileStatus(uploadFile.id, { fileHash });
        } catch (hashError) {
          console.warn('Failed to calculate file hash, proceeding without integrity check:', hashError);
        }
      }

      // Step 2: Get presigned URL dari server
      updateFileStatus(uploadFile.id, { status: 'uploading', progress: 5 });
      
      const presignedRes = await fetch('/api/admin/upload/presigned', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: fileToUpload.name,
          contentType: fileToUpload.type || 'image/jpeg', // Fallback content type
          galleryId,
          r2AccountId,
          cloudinaryAccountId,
          fileSize: fileToUpload.size,
          fileHash, // Include hash for integrity verification
        }),
        signal: abortController.signal,
      });

      const presignedData = await presignedRes.json();
      if (!presignedRes.ok) {
        throw new Error(presignedData.error || `Server error: ${presignedRes.status}`);
      }

      const { presignedUrl, publicUrl: _publicUrl, r2Key: _r2Key, uploadId } = presignedData.data || presignedData;

      // Update status: Uploading
      updateFileStatus(uploadFile.id, { status: 'uploading', progress: 10 });

      // Step 3: Upload langsung ke R2 (bypass server!)
      const r2Res = await fetch(presignedUrl, {
        method: 'PUT',
        body: fileToUpload,
        headers: {
          'Content-Type': fileToUpload.type,
        },
        signal: abortController.signal,
      });

      if (!r2Res.ok) {
        const errorText = await r2Res.text().catch(() => 'Unknown error');
        throw new Error(`R2 upload failed (${r2Res.status}): ${errorText}`);
      }

      // Update status: Processing thumbnail
      updateFileStatus(uploadFile.id, { status: 'processing', progress: 50 });

      // Step 4: Notify server untuk generate thumbnail
      const completeRes = await fetch('/api/admin/upload/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uploadId,
          fileSize: fileToUpload.size,
          fileHash, // Include hash for integrity verification
        }),
        signal: abortController.signal,
      });

      const completeData = await completeRes.json();
      if (!completeRes.ok) {
        throw new Error(completeData.error || 'Thumbnail generation failed');
      }

      const { photo } = completeData.data || completeData;

      // Update status: Completed
      updateFileStatus(uploadFile.id, {
        status: 'completed',
        progress: 100,
        photoId: photo.id,
        thumbnailUrl: photo.thumbnailUrl,
      });

      // Reset retry count on success
      updateFileStatus(uploadFile.id, { retryCount: 0 });

      onComplete?.(photo);
    } catch (error) {
      const isAborted = error instanceof Error && error.name === 'AbortError';
      
      if (isAborted) {
        updateFileStatus(uploadFile.id, { status: 'pending', progress: 0 });
        return;
      }
      
      const { message, code } = formatErrorMessage(error, 'Upload failed');
      
      // Check if should retry
      if (isRetryableError(code) && uploadFile.retryCount < maxRetries) {
        const retryCount = uploadFile.retryCount + 1;
        const delay = RETRY_DELAYS_MS[Math.min(retryCount - 1, RETRY_DELAYS_MS.length - 1)];
        
        console.log(`[Upload] Retrying ${uploadFile.file.name} (attempt ${retryCount}/${maxRetries}) after ${delay}ms...`);
        
        // Update status dengan info retry
        updateFileStatus(uploadFile.id, { 
          status: 'pending', 
          error: `Upload gagal, mencoba ulang (${retryCount}/${maxRetries})...`,
          progress: 0,
          retryCount,
        });
        
        // Schedule retry dengan exponential backoff
        const timeout = setTimeout(() => {
          retryTimeouts.current.delete(uploadFile.id);
          uploadFileWithRetry(uploadFile);
        }, delay);
        
        retryTimeouts.current.set(uploadFile.id, timeout);
        return;
      }
      
      // Max retries reached or non-retryable error
      updateFileStatus(uploadFile.id, { 
        status: 'failed', 
        error: message,
        errorCode: code,
        progress: 0,
      });
      
      setErrors(prev => [...prev, { fileId: uploadFile.id, message, code }]);
      onError?.(uploadFile.id, message, code);
    } finally {
      abortControllers.current.delete(uploadFile.id);
      decrementActiveUploads();
    }
  };

  // HIGH PRIORITY FIX #2: Centralized counter management
  const incrementActiveUploads = () => {
    activeUploads.current++;
  };

  const decrementActiveUploads = () => {
    activeUploads.current--;
  };

  // Wrapper untuk upload dengan retry support
  const uploadFileWithRetry = async (file: UploadFile): Promise<void> => {
    // HIGH PRIORITY FIX #3: Use latest file state to prevent stale data
    const currentFile = filesRef.current.find(f => f.id === file.id);
    if (!currentFile || currentFile.status === 'completed' || currentFile.status === 'failed') {
      return;
    }
    
    // Prevent duplicate processing across all upload paths
    if (processingIds.current.has(file.id)) return;
    processingIds.current.add(file.id);
    
    incrementActiveUploads();
    try {
      await uploadFile(currentFile);
    } finally {
      processingIds.current.delete(file.id);
    }
  };

  // Worker untuk upload batch
  const uploadWorker = async () => {
    while (true) {
      const currentFiles = filesRef.current;
      
      // Cari file pending yang tidak sedang diproses atau menunggu retry
      const pendingFile = currentFiles.find(f => 
        f.status === 'pending' && 
        !processingIds.current.has(f.id) &&
        !retryTimeouts.current.has(f.id)
      );
      
      if (!pendingFile) break;
      
      if (activeUploads.current >= maxConcurrent) {
        await sleep(100);
        continue;
      }

      // Tandai file sedang diproses
      processingIds.current.add(pendingFile.id);
      incrementActiveUploads();
      
      try {
        // Gunakan await agar worker menunggu satu file selesai sebelum mengambil berikutnya
        await uploadFile(pendingFile);
      } finally {
        // HIGH PRIORITY FIX #4: Always cleanup processingIds to prevent memory leak
        processingIds.current.delete(pendingFile.id);
      }
      
      await sleep(10);
    }
  };

  // Start upload semua file
  const startUpload = async () => {
    setIsUploading(true);
    
    // Get fresh files from ref
    const currentFiles = filesRef.current;
    const totalFiles = currentFiles.length;
    const pendingFiles = currentFiles.filter(f => f.status === 'pending');
    const isSmallBatch = pendingFiles.length < SMALL_BATCH_THRESHOLD;
    
    console.log(`[Upload] Starting upload of ${pendingFiles.length} pending files (total: ${totalFiles})`);
    
    // Small batch: Upload semua parallel tanpa batching
    // Large batch: Compress dulu, baru upload dengan concurrency control
    if (isSmallBatch) {
      console.log(`[Upload] Small batch detected (${pendingFiles.length} files) - Uploading all at once`);
      
      // Compress dan upload langsung semua parallel
      const uploadPromises = pendingFiles.map(async (file) => {
        // Prevent duplicate processing
        if (processingIds.current.has(file.id)) return;
        processingIds.current.add(file.id);
        
        try {
          // Compress
          updateFileStatus(file.id, { status: 'compressing' });
          const compressed = await compressFile(file.file);
          updateFileStatus(file.id, { 
            status: 'pending',
            compressed,
          });
          
          // Upload - increment activeUploads before uploadFile (uploadFile only decrements)
          incrementActiveUploads();
          await uploadFile({ ...file, compressed });
        } finally {
          processingIds.current.delete(file.id);
        }
      });
      
      await Promise.all(uploadPromises);
    } else {
      console.log(`[Upload] Large batch detected (${pendingFiles.length} files) - Using batching strategy`);
      
      // MEDIUM PRIORITY FIX #6: Parallel compression with concurrency limit (hemat memory)
      // LOW PRIORITY FIX: Use index pointer instead of shift() to avoid O(N²) complexity
      const compressionQueue = [...pendingFiles];
      let queueIndex = 0;
      const compressionWorkers: Promise<void>[] = [];
      
      for (let i = 0; i < Math.min(MAX_COMPRESSION_WORKERS, compressionQueue.length); i++) {
        compressionWorkers.push((async () => {
          while (queueIndex < compressionQueue.length) {
            const currentIndex = queueIndex++;
            const file = compressionQueue[currentIndex];
            if (!file || file.compressed) continue;
            
            updateFileStatus(file.id, { status: 'compressing' });
            const compressed = await compressFile(file.file);
            updateFileStatus(file.id, { 
              status: 'pending',
              compressed,
            });
          }
        })());
      }
      
      await Promise.all(compressionWorkers);

      // Start upload workers dengan concurrency control
      const workers: Promise<void>[] = [];
      const workerCount = Math.min(maxConcurrent, MAX_UPLOAD_WORKERS);
      for (let i = 0; i < workerCount; i++) {
        workers.push(uploadWorker());
      }
      
      await Promise.all(workers);
    }
    
    setIsUploading(false);
  };

  // Add files ke queue dengan validasi
  const addFiles = useCallback((newFiles: FileList | null) => {
    if (!newFiles) return;

    const fileArray = Array.from(newFiles);
    const validFiles: UploadFile[] = [];
    const invalidFiles: { filename: string; reason: string }[] = [];
    
    // Validasi dan filter files
    for (const file of fileArray) {
      // Validasi: max 50MB
      if (file.size > maxFileSize) {
        invalidFiles.push({ 
          filename: file.name, 
          reason: `File terlalu besar: ${(file.size / 1024 / 1024).toFixed(1)}MB (maks ${maxFileSize / 1024 / 1024}MB)` 
        });
        continue;
      }
      
      // Validasi: file type
      const typeValidation = validateFileType(file);
      if (!typeValidation.valid) {
        invalidFiles.push({ 
          filename: file.name, 
          reason: typeValidation.error || 'Format file tidak didukung' 
        });
        continue;
      }
      
      validFiles.push({
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        file,
        fileHash: undefined, // Will be calculated before upload
        status: 'pending',
        progress: 0,
        retryCount: 0,
      });
    }
    
    // Report invalid files
    if (invalidFiles.length > 0) {
      invalidFiles.forEach(({ filename, reason }) => {
        onInvalidFile?.(filename, reason);
      });
    }
    
    // Validasi: max files per batch
    if (files.length + validFiles.length > MAX_FILES_PER_BATCH) {
      const excess = files.length + validFiles.length - MAX_FILES_PER_BATCH;
      const acceptedFiles = validFiles.slice(0, validFiles.length - excess);
      
      if (acceptedFiles.length === 0) {
        toast.error(`Maksimal ${MAX_FILES_PER_BATCH} foto per upload batch. Silakan hapus beberapa foto terlebih dahulu.`);
        return;
      }
      
      toast.warning(`Hanya ${acceptedFiles.length} foto yang diterima karena maksimal ${MAX_FILES_PER_BATCH} foto.`);
      setFiles(prev => [...prev, ...acceptedFiles]);
      return;
    }

    setFiles(prev => [...prev, ...validFiles]);
  }, [files.length, maxFileSize, onInvalidFile]);

  // Remove file dari queue
  const removeFile = useCallback((id: string) => {
    // Cancel any pending retry
    const timeout = retryTimeouts.current.get(id);
    if (timeout) {
      clearTimeout(timeout);
      retryTimeouts.current.delete(id);
    }
    
    const controller = abortControllers.current.get(id);
    if (controller) {
      controller.abort();
      abortControllers.current.delete(id);
    }
    
    setFiles(prev => prev.filter(f => f.id !== id));
  }, []);

  // Manual retry failed upload
  const retryFile = useCallback((id: string) => {
    // Cancel any pending auto-retry
    const timeout = retryTimeouts.current.get(id);
    if (timeout) {
      clearTimeout(timeout);
      retryTimeouts.current.delete(id);
    }
    
    setFiles(prev => prev.map(f => 
      f.id === id 
        ? { ...f, status: 'pending', error: undefined, progress: 0, retryCount: 0 }
        : f
    ));
  }, []);

  // Update file status helper
  const updateFileStatus = (id: string, updates: Partial<UploadFile>) => {
    setFiles(prev => {
      const updated = prev.map(f => 
        f.id === id ? { ...f, ...updates } : f
      );
      
      // Calculate overall progress
      const completed = updated.filter(f => f.status === 'completed').length;
      onProgress?.(completed, updated.length);
      
      return updated;
    });
  };

  // Clear all files
  const clearFiles = useCallback(() => {
    // Cancel semua retry timeouts
    retryTimeouts.current.forEach(timeout => clearTimeout(timeout));
    retryTimeouts.current.clear();
    
    // Cancel semua active uploads
    abortControllers.current.forEach(controller => controller.abort());
    abortControllers.current.clear();
    
    setFiles([]);
    setErrors([]);
    setIsUploading(false);
    activeUploads.current = 0;
  }, []);

  // Clear errors
  const clearErrors = useCallback(() => {
    setErrors([]);
  }, []);

  const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

  return {
    files,
    isUploading,
    errors,
    addFiles,
    removeFile,
    startUpload,
    retryFile,
    clearFiles,
    clearErrors,
    completedCount: files.filter(f => f.status === 'completed').length,
    failedCount: files.filter(f => f.status === 'failed').length,
    totalCount: files.length,
    progress: files.length > 0 
      ? files.reduce((sum, f) => sum + f.progress, 0) / files.length 
      : 0,
  };
}
