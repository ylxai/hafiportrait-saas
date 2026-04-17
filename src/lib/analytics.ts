import { prisma } from '@/lib/db';

/**
 * Track upload success/failure for analytics
 * Non-blocking: errors are logged but don't affect the main flow
 */
export async function trackUploadResult(
  galleryId: string,
  success: boolean,
  errorReason?: string
) {
  try {
    await prisma.uploadAnalytics.create({
      data: {
        galleryId,
        success,
        errorReason: errorReason || null,
        timestamp: new Date(),
      },
    });
  } catch (error) {
    console.error('[Analytics] Failed to track upload result:', error);
  }
}

/**
 * Get upload success/failure stats for a gallery
 */
export async function getUploadStats(galleryId: string) {
  try {
    const stats = await prisma.uploadAnalytics.groupBy({
      by: ['success'],
      where: { galleryId },
      _count: { success: true },
    });

    const successCount = stats.find(s => s.success)?._count.success || 0;
    const failureCount = stats.find(s => !s.success)?._count.success || 0;
    const total = successCount + failureCount;

    return {
      total,
      success: successCount,
      failure: failureCount,
      successRate: total > 0 ? (successCount / total) * 100 : 0,
    };
  } catch (error) {
    console.error('[Analytics] Failed to get upload stats:', error);
    return { total: 0, success: 0, failure: 0, successRate: 0 };
  }
}

/**
 * Get storage usage trends (last 30 days)
 */
export async function getStorageUsageTrends(clientId: string) {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const photos = await prisma.photo.findMany({
      where: {
        gallery: {
          event: { clientId },
        },
        createdAt: { gte: thirtyDaysAgo },
      },
      select: {
        fileSize: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    // Group by day
    const dailyUsage = photos.reduce((acc, photo) => {
      const date = photo.createdAt.toISOString().split('T')[0];
      if (!acc[date]) {
        acc[date] = BigInt(0);
      }
      acc[date] += photo.fileSize || BigInt(0);
      return acc;
    }, {} as Record<string, bigint>);

    return Object.entries(dailyUsage).map(([date, bytes]) => ({
      date,
      bytes: bytes.toString(),
      mb: Number(bytes) / (1024 * 1024),
    }));
  } catch (error) {
    console.error('[Analytics] Failed to get storage trends:', error);
    return [];
  }
}
