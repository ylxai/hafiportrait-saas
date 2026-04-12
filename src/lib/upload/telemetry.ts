// MEDIUM PRIORITY FIX #7: Upload telemetry and analytics
import { prisma } from '@/lib/db';

export interface UploadMetrics {
  totalUploads: number;
  successfulUploads: number;
  failedUploads: number;
  successRate: number;
  retryRate: number;
  averageFileSize: number;
  totalBytesUploaded: bigint;
  errorBreakdown: Record<string, number>;
}

export async function trackUploadAttempt(
  galleryId: string,
  fileSize: number,
  success: boolean,
  errorCode?: string,
  retryCount?: number
): Promise<void> {
  // Store in a separate analytics table or log to external service
  // For now, just console log for monitoring
  console.log('[Upload Telemetry]', {
    galleryId,
    fileSize,
    success,
    errorCode,
    retryCount,
    timestamp: new Date().toISOString(),
  });
}

export async function getUploadMetrics(
  galleryId?: string,
  startDate?: Date,
  endDate?: Date
): Promise<UploadMetrics> {
  // This would query from analytics table
  // Placeholder implementation
  const photos = await prisma.photo.findMany({
    where: {
      galleryId,
      createdAt: {
        gte: startDate,
        lte: endDate,
      },
    },
    select: {
      fileSize: true,
    },
  });
  
  const totalUploads = photos.length;
  const totalBytesUploaded = photos.reduce((sum, p) => sum + (p.fileSize || BigInt(0)), BigInt(0));
  const averageFileSize = totalUploads > 0 ? Number(totalBytesUploaded) / totalUploads : 0;
  
  return {
    totalUploads,
    successfulUploads: totalUploads, // All photos in DB are successful
    failedUploads: 0, // Would need separate tracking
    successRate: 100,
    retryRate: 0, // Would need separate tracking
    averageFileSize,
    totalBytesUploaded,
    errorBreakdown: {},
  };
}
