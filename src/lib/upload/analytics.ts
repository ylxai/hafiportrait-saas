/**
 * Upload analytics types.
 * The UploadAnalyticsData interface is used across the codebase for
 * typing analytics dashboard data structures.
 */

// NOTE: Renamed from UploadAnalytics to avoid conflict with the Prisma model of the same name.
export interface UploadAnalyticsData {
  period: 'day' | 'week' | 'month';
  totalUploads: number;
  successfulUploads: number;
  failedUploads: number;
  successRate: number;
  averageUploadTime: number; // in seconds
  averageFileSize: number; // in bytes
  totalBytesUploaded: string; // BigInt as string for JSON serialization
  topErrorTypes: Array<{ errorCode: string; count: number }>;
  uploadsByHour: Array<{ hour: number; count: number }>;
  uploadsByGallery: Array<{ galleryId: string; galleryName: string; count: number }>;
}
