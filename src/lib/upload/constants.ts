// Upload system constants
// Centralized configuration for upload limits and timeouts

// File size limits
export const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50MB
export const MAX_FILE_SIZE_MB = 50;
export const MIN_COMPRESSION_SIZE_BYTES = 2 * 1024 * 1024; // 2MB - skip compression for smaller files

// Upload limits
export const MAX_FILES_PER_BATCH = 400;
export const SMALL_BATCH_THRESHOLD = 10; // Files count threshold for batch strategy

// Storage quota (default per client, now configurable per-client in DB)
export const BYTES_PER_GB = 1024 * 1024 * 1024;
export const DEFAULT_STORAGE_QUOTA_GB = 10;

// Quota warning thresholds
export const QUOTA_WARNING_THRESHOLDS = [80, 90, 95] as const;

// Concurrency limits
export const MAX_CONCURRENT_UPLOADS = 10;
export const MAX_COMPRESSION_WORKERS = 3;
export const MAX_UPLOAD_WORKERS = 10;

// Timeouts and expiry
export const PRESIGNED_URL_EXPIRY_SECONDS = 900; // 15 minutes
export const UPLOAD_SESSION_EXPIRY_MS = 60 * 60 * 1000; // 1 hour

// Retry configuration
export const MAX_RETRY_ATTEMPTS = 3;
export const RETRY_DELAYS_MS = [1000, 2000, 4000]; // Exponential backoff: 1s, 2s, 4s
export const UPLOAD_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes for large file uploads

// Compression settings
export const COMPRESSION_MAX_DIMENSION = 4096;
export const COMPRESSION_QUALITY = 0.92;
// Note: Pica auto-detects Web Worker/WASM support at runtime.
// Note: EXIF is not preserved during client-side compression (canvas strips it).
// Original files uploaded to R2 retain full EXIF; only compressed previews lose it.

// Allowed file types
export const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.heic', '.nef', '.cr2', '.arw', '.dng', '.raw'];
export const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'image/x-canon-cr2',
  'image/x-nikon-nef',
  'image/x-sony-arw',
  'image/x-adobe-dng',
  'image/x-raw',
];

// RAW file extensions (skip compression)
export const RAW_FILE_EXTENSIONS = ['.nef', '.cr2', '.arw', '.dng', '.raw'];
