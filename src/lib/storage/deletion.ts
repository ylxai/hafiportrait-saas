import { deleteFromR2 } from '@/lib/upload/presigned';
import { deleteFromCloudinary, getCloudinaryPublicId } from '@/lib/storage/cloudinary';
import { decreaseStorageUsage, getStorageCredentials } from '@/lib/storage/accounts';
import { logger } from '@/lib/logger';

interface DeletionJobData {
  photoId: string;
  r2Key?: string;
  thumbnailUrl?: string;
  storageAccountId?: string;
  fileSize?: bigint;
}

/**
 * Perform actual deletion of photo from storage
 * This is called by the worker, NOT during the API request
 */
export async function performPhotoDeletion(data: DeletionJobData): Promise<void> {
  const { photoId, r2Key, thumbnailUrl, storageAccountId, fileSize } = data;

  logger.info('deletion_worker.start', { photoId });

  let r2Deleted = false;
  let cloudinaryDeleted = false;
  let storageUpdated = false;

  // 1. Hapus dari R2 (Original File)
  if (r2Key) {
    try {
      await deleteFromR2(r2Key);
      logger.info('deletion_worker.r2.deleted', { photoId, r2Key });
      r2Deleted = true;
    } catch (error) {
      logger.error('deletion_worker.r2.delete_failed', { photoId, r2Key, err: error });
      // Will retry via Cloudflare Queue
      throw new Error(`R2 deletion failed: ${error}`);
    }
  }

  // 2. Hapus dari Cloudinary (Thumbnail)
  if (thumbnailUrl && storageAccountId) {
    try {
      const publicId = getCloudinaryPublicId(thumbnailUrl);
      if (publicId) {
        const creds = await getStorageCredentials(storageAccountId);
        
        // Skip if not Cloudinary account (e.g., R2-only setup)
        if (creds.provider !== 'CLOUDINARY') {
          logger.info('deletion_worker.cloudinary.skipped_non_cloudinary', {
            photoId,
            provider: creds.provider,
          });
        } else {
          const cloudinaryCreds = {
            cloudName: creds.cloudName || '',
            apiKey: creds.apiKey || '',
            apiSecret: creds.apiSecret || '',
          };

          await deleteFromCloudinary(publicId, cloudinaryCreds);
          logger.info('deletion_worker.cloudinary.deleted', { photoId, publicId });
          cloudinaryDeleted = true;
        }
      }
    } catch (error) {
      logger.error('deletion_worker.cloudinary.delete_failed', { photoId, err: error });
      // Will retry via Cloudflare Queue
      throw new Error(`Cloudinary deletion failed: ${error}`);
    }
  }

  // 3. Update storage usage (kurangi usedStorage)
  if (storageAccountId && fileSize) {
    try {
      await decreaseStorageUsage(storageAccountId, fileSize);
      logger.info('deletion_worker.storage_usage.updated', { photoId, storageAccountId });
      storageUpdated = true;
    } catch (error) {
      logger.error('deletion_worker.storage_usage.update_failed', {
        photoId,
        storageAccountId,
        err: error,
      });
      // Don't throw here - storage update failure shouldn't block deletion
    }
  }

  logger.info('deletion_worker.completed', {
    photoId,
    r2Deleted,
    cloudinaryDeleted,
    storageUpdated,
  });
}
