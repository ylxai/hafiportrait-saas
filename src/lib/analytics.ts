import { prisma } from '@/lib/db';

const BYTES_PER_MB = 1024 * 1024;

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

    const successCount = stats.find((s: typeof stats[number]) => s.success)?._count.success || 0;
    const failureCount = stats.find((s: typeof stats[number]) => !s.success)?._count.success || 0;
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
 * Uses database-level aggregation for performance
 */
export async function getStorageUsageTrends(clientId: string) {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Use raw query for efficient DB-level aggregation
    const dailyUsage = await prisma.$queryRaw<Array<{ date: string; bytes: bigint }>>`
      SELECT 
        DATE("createdAt") as date,
        SUM("fileSize")::bigint as bytes
      FROM "Photo"
      WHERE "galleryId" IN (
        SELECT "id" FROM "Gallery"
        WHERE "eventId" IN (
          SELECT "id" FROM "Event"
          WHERE "clientId" = ${clientId}
        )
      )
      AND "createdAt" >= ${thirtyDaysAgo}
      GROUP BY DATE("createdAt")
      ORDER BY date ASC
    `;

    return dailyUsage.map(({ date, bytes }: typeof dailyUsage[number]) => ({
      date,
      bytes: bytes.toString(),
      mb: Number(bytes) / BYTES_PER_MB,
    }));
  } catch (error) {
    console.error('[Analytics] Failed to get storage trends:', error);
    return [];
  }
}
