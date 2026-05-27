import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';

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
    logger.error('analytics.track_upload_result.failed', { galleryId, err: error });
  }
}
