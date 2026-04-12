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
  
  // HIGH PRIORITY FIX: Use Prisma aggregation instead of findMany (performance optimization)
  // Get total count and sum in one query
  const aggregation = await prisma.photo.aggregate({
    where: {
      createdAt: {
        gte: startDate,
        lte: now,
      },
    },
    _count: true,
    _sum: {
      fileSize: true,
    },
  });
  
  const totalUploads = aggregation._count;
  const totalBytesUploaded = aggregation._sum.fileSize || BigInt(0);
  const averageFileSize = totalUploads > 0 ? Number(totalBytesUploaded) / totalUploads : 0;
  
  // HIGH PRIORITY FIX: Use groupBy for gallery aggregation (database-level)
  const galleryGroups = await prisma.photo.groupBy({
    by: ['galleryId'],
    where: {
      createdAt: {
        gte: startDate,
        lte: now,
      },
    },
    _count: true,
    orderBy: {
      _count: {
        galleryId: 'desc',
      },
    },
    take: 10, // Top 10
  });
  
  // Fetch gallery names for top 10
  const galleryIds = galleryGroups.map(g => g.galleryId);
  const galleries = await prisma.gallery.findMany({
    where: {
      id: {
        in: galleryIds,
      },
    },
    select: {
      id: true,
      namaProject: true,
    },
  });
  
  const galleryNameMap = new Map(galleries.map(g => [g.id, g.namaProject]));
  
  const uploadsByGallery = galleryGroups.map(g => ({
    galleryId: g.galleryId,
    galleryName: galleryNameMap.get(g.galleryId) || 'Unknown',
    count: g._count,
  }));
  
  // For uploadsByHour, we still need to fetch createdAt (no native hour grouping in Prisma)
  // But only fetch the hour field, not entire records
  const photosForHourly = await prisma.photo.findMany({
    where: {
      createdAt: {
        gte: startDate,
        lte: now,
      },
    },
    select: {
      createdAt: true,
    },
  });
  
  const uploadsByHour = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    count: 0,
  }));
  
  photosForHourly.forEach(p => {
    const hour = p.createdAt.getHours();
    uploadsByHour[hour].count++;
  });
  
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
