import { deleteFromR2 } from '@/lib/upload/presigned';
import { deleteFromCloudinary, getCloudinaryPublicId } from '@/lib/storage/cloudinary';
import { decreaseStorageUsage, getStorageCredentials } from '@/lib/storage/accounts';

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

  console.log(`[DeletionWorker] Processing deletion for photo ${photoId}`);

  let r2Deleted = false;
  let cloudinaryDeleted = false;
  let storageUpdated = false;

  // 1. Hapus dari R2 (Original File)
  if (r2Key) {
    try {
      await deleteFromR2(r2Key);
      console.log(`[DeletionWorker] R2 file deleted: ${r2Key}`);
      r2Deleted = true;
    } catch (error) {
      console.error(`[DeletionWorker] Failed to delete R2 file ${r2Key}:`, error);
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
          console.log(`[DeletionWorker] Skipping Cloudinary deletion - account is ${creds.provider}`);
        } else {
          const cloudinaryCreds = {
            cloudName: creds.cloudName || '',
            apiKey: creds.apiKey || '',
            apiSecret: creds.apiSecret || '',
          };

          await deleteFromCloudinary(publicId, cloudinaryCreds);
        console.log(`[DeletionWorker] Cloudinary file deleted: ${publicId}`);
        cloudinaryDeleted = true;
      }
    } catch (error) {
      console.error(`[DeletionWorker] Failed to delete Cloudinary file:`, error);
      // Will retry via Cloudflare Queue
      throw new Error(`Cloudinary deletion failed: ${error}`);
    }
  }

  // 3. Update storage usage (kurangi usedStorage)
  if (storageAccountId && fileSize) {
    try {
      await decreaseStorageUsage(storageAccountId, fileSize);
      console.log(`[DeletionWorker] Storage usage updated for account ${storageAccountId}`);
      storageUpdated = true;
    } catch (error) {
      console.error(`[DeletionWorker] Failed to update storage usage:`, error);
      // Don't throw here - storage update failure shouldn't block deletion
    }
  }

  console.log(`[DeletionWorker] Photo ${photoId} deletion completed:`, {
    r2Deleted,
    cloudinaryDeleted,
    storageUpdated,
  });
}
