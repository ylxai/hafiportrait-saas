// LOW PRIORITY FIX #10: Upload analytics dashboard data structure
import { prisma } from '@/lib/db';

export interface UploadAnalytics {
  period: 'day' | 'week' | 'month';
  totalUploads: number;
  successfulUploads: number;
  failedUploads: number;
  successRate: number;
  averageUploadTime: number; // in seconds
  averageFileSize: number; // in bytes
  totalBytesUploaded: string; // CRITICAL FIX: BigInt as string for JSON serialization
  topErrorTypes: Array<{ errorCode: string; count: number }>;
  uploadsByHour: Array<{ hour: number; count: number }>;
  uploadsByGallery: Array<{ galleryId: string; galleryName: string; count: number }>;
}

const VALID_PERIODS = ['day', 'week', 'month'] as const;

export async function getUploadAnalyticsDashboard(
  period: 'day' | 'week' | 'month' = 'week'
): Promise<UploadAnalytics> {
  // Input validation
  if (!VALID_PERIODS.includes(period)) {
    throw new Error(`Invalid period: ${period}. Must be one of: ${VALID_PERIODS.join(', ')}`);
  }

  const now = new Date();
  const startDate = new Date();
  
  switch (period) {
    case 'day':
      startDate.setDate(now.getDate() - 1);
      break;
    case 'week':
      startDate.setDate(now.getDate() - 7);
      break;
    case 'month':
      startDate.setMonth(now.getMonth() - 1);
      break;
  }
  
  // MEDIUM PRIORITY FIX: Use select to fetch only needed fields (performance optimization)
  const photos = await prisma.photo.findMany({
    where: {
      createdAt: {
        gte: startDate,
        lte: now,
      },
    },
    select: {
      fileSize: true,
      createdAt: true,
      galleryId: true,
      gallery: {
        select: {
          id: true,
          namaProject: true,
        },
      },
    },
  });
  
  const totalUploads = photos.length;
  
  // Handle BigInt overflow safely
  let totalBytesUploaded = BigInt(0);
  try {
    totalBytesUploaded = photos.reduce((sum, p) => sum + (p.fileSize || BigInt(0)), BigInt(0));
  } catch (error) {
    console.error('[Analytics] BigInt overflow in totalBytesUploaded calculation:', error);
    totalBytesUploaded = BigInt(0);
  }
  
  const averageFileSize = totalUploads > 0 ? Number(totalBytesUploaded) / totalUploads : 0;
  
  // LOW PRIORITY FIX: Optimize hour grouping - O(N) instead of O(N*24)
  const uploadsByHour = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    count: 0,
  }));
  
  photos.forEach(p => {
    const hour = p.createdAt.getHours();
    uploadsByHour[hour].count++;
  });
  
  // Group by gallery
  const galleryMap = new Map<string, { name: string; count: number }>();
  photos.forEach(p => {
    const existing = galleryMap.get(p.galleryId);
    if (existing) {
      existing.count++;
    } else {
      galleryMap.set(p.galleryId, { name: p.gallery.namaProject, count: 1 });
    }
  });
  
  const uploadsByGallery = Array.from(galleryMap.entries())
    .map(([galleryId, data]) => ({
      galleryId,
      galleryName: data.name,
      count: data.count,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10); // Top 10
  
  return {
    period,
    totalUploads,
    successfulUploads: totalUploads, // All photos in DB are successful
    failedUploads: 0, // Would need separate tracking
    successRate: totalUploads > 0 ? 100 : 0,
    averageUploadTime: 0, // Would need separate tracking
    averageFileSize,
    totalBytesUploaded: totalBytesUploaded.toString(), // CRITICAL FIX: Convert BigInt to string for JSON
    topErrorTypes: [], // Would need separate tracking
    uploadsByHour,
    uploadsByGallery,
  };
}

// TODO: Add test coverage for analytics module
// - Test period validation (valid/invalid periods)
// - Test BigInt overflow handling
// - Test empty photo set
// - Test date range calculations
// - Test aggregation logic

// API route to expose this data
// GET /api/admin/analytics/uploads?period=week
