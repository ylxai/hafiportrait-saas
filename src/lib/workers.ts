import { Worker } from 'bullmq';
import { redis } from './redis';
import { prisma } from './db';
import { downloadFromR2 } from './storage/r2';
import { uploadToCloudinary, generateThumbnailUrl } from './storage/cloudinary';
import { updateStorageUsage, getDefaultAccount, getStorageAccountById } from './storage/accounts';
import { performPhotoDeletion } from './storage/deletion';
import { publishPhotoUploaded } from './ably';
import imageSize from 'image-size';

// Upload processing worker
export const uploadWorker = new Worker(
  'upload-processing',
  async (job) => {
    const { uploadId, r2Key, publicUrl, filename, galleryId, fileSize, storageAccountId } = job.data;

    console.log(`[UploadWorker] Processing upload ${uploadId} for gallery ${galleryId}`);

    try {
      // Get R2 account untuk tracking (use provided or default)
      let r2AccountId = storageAccountId;
      let r2Account = r2AccountId ? await getStorageAccountById(r2AccountId) : await getDefaultAccount('R2');
      if (!r2Account && !r2AccountId) {
        r2Account = await getDefaultAccount('R2');
      }
      if (!r2Account) {
        throw new Error('No active R2 storage account configured in database');
      }
      r2AccountId = r2Account.id;

      const r2Creds = {
        accountId: r2Account.accountId || '',
        accessKey: r2Account.accessKey || '',
        secretKey: r2Account.secretKey || '',
        bucketName: r2Account.bucketName || '',
        publicUrl: r2Account.publicUrl || '',
        endpoint: r2Account.endpoint || undefined,
      };

      // Download dari R2 untuk generate thumbnail
      const fileBuffer = await downloadFromR2(r2Key, r2Creds);

      // Get image dimensions
      let imgWidth = 0;
      let imgHeight = 0;
      try {
        const dimensions = imageSize(fileBuffer);
        imgWidth = dimensions.width || 0;
        imgHeight = dimensions.height || 0;
      } catch {
        console.warn('[UploadWorker] Could not get image dimensions');
      }

      // Get Cloudinary account
      const cloudinaryAccount = await getDefaultAccount('CLOUDINARY');
      if (!cloudinaryAccount) {
        throw new Error('No active Cloudinary storage account configured in database');
      }
      
      const cloudinaryCreds = {
        cloudName: cloudinaryAccount.cloudName || '',
        apiKey: cloudinaryAccount.apiKey || '',
        apiSecret: cloudinaryAccount.apiSecret || '',
      };

      // Upload ke Cloudinary untuk thumbnail
      const cloudinaryResult = await uploadToCloudinary(
        fileBuffer,
        `gallery/${galleryId}`,
        cloudinaryCreds
      );

      // Generate thumbnail URL
      const thumbnailUrl = generateThumbnailUrl(cloudinaryResult.publicId, 400, 400, cloudinaryCreds);

      // Create photo record
      const photo = await prisma.photo.create({
        data: {
          galleryId,
          filename,
          url: publicUrl,
          r2Key: r2Key,
          thumbnailUrl,
          width: imgWidth,
          height: imgHeight,
          fileSize: BigInt(fileSize),
          storageAccountId: r2AccountId || null,
        },
      });

      // Update storage usage
      if (r2AccountId) {
        await updateStorageUsage(r2AccountId, BigInt(fileSize));
      }

      // Notify client via Ably
      await publishPhotoUploaded(galleryId, {
        photoId: photo.id,
        filename: photo.filename,
        thumbnailUrl: photo.thumbnailUrl,
      });

      console.log(`[UploadWorker] Completed upload ${uploadId}, photo ID: ${photo.id}`);

      return {
        photoId: photo.id,
        filename: photo.filename,
        thumbnailUrl: photo.thumbnailUrl,
      };
    } catch (error) {
      console.error(`[UploadWorker] Failed to process upload ${uploadId}:`, error);
      throw error;
    }
  },
  {
    connection: redis,
    concurrency: 5, // Process 5 uploads concurrently
  }
);

// Thumbnail generation worker (for regenerating thumbnails)
export const thumbnailWorker = new Worker(
  'thumbnail-generation',
  async (job) => {
    const { photoId, r2Key, galleryId } = job.data;

    console.log(`[ThumbnailWorker] Regenerating thumbnail for photo ${photoId}`);

    try {
      // Get R2 account
      const r2Account = await getDefaultAccount('R2');
      if (!r2Account) {
        throw new Error('No active R2 storage account configured in database');
      }

      const r2Creds = {
        accountId: r2Account.accountId || '',
        accessKey: r2Account.accessKey || '',
        secretKey: r2Account.secretKey || '',
        bucketName: r2Account.bucketName || '',
        publicUrl: r2Account.publicUrl || '',
        endpoint: r2Account.endpoint || undefined,
      };

      // Download from R2
      const fileBuffer = await downloadFromR2(r2Key, r2Creds);

      // Get Cloudinary account
      const cloudinaryAccount = await getDefaultAccount('CLOUDINARY');
      if (!cloudinaryAccount) {
        throw new Error('No active Cloudinary storage account configured in database');
      }
      
      const cloudinaryCreds = {
        cloudName: cloudinaryAccount.cloudName || '',
        apiKey: cloudinaryAccount.apiKey || '',
        apiSecret: cloudinaryAccount.apiSecret || '',
      };

      // Upload to Cloudinary
      const cloudinaryResult = await uploadToCloudinary(
        fileBuffer,
        `gallery/${galleryId}`,
        cloudinaryCreds
      );

      // Generate new thumbnail URL
      const thumbnailUrl = generateThumbnailUrl(cloudinaryResult.publicId, 400, 400, cloudinaryCreds);

      // Update photo record
      await prisma.photo.update({
        where: { id: photoId },
        data: { thumbnailUrl },
      });

      console.log(`[ThumbnailWorker] Regenerated thumbnail for photo ${photoId}`);

      return { photoId, thumbnailUrl };
    } catch (error) {
      console.error(`[ThumbnailWorker] Failed to regenerate thumbnail for ${photoId}:`, error);
      throw error;
    }
  },
  {
    connection: redis,
    concurrency: 3,
  }
);

// Notification delivery worker
export const notificationWorker = new Worker(
  'notification-delivery',
  async (job) => {
    const { type, payload } = job.data;

    console.log(`[NotificationWorker] Sending ${type} notification`);

    try {
      switch (type) {
        case 'email':
          // TODO: Implement email sending
          console.log('[NotificationWorker] Email notification:', payload);
          break;

        case 'whatsapp':
          // TODO: Implement WhatsApp notification
          console.log('[NotificationWorker] WhatsApp notification:', payload);
          break;

        case 'push':
          // TODO: Implement push notification
          console.log('[NotificationWorker] Push notification:', payload);
          break;

        default:
          console.log('[NotificationWorker] Unknown notification type:', type);
      }

      return { success: true };
    } catch (error) {
      console.error('[NotificationWorker] Failed to send notification:', error);
      throw error;
    }
  },
  {
    connection: redis,
    concurrency: 10,
  }
);

// Storage deletion worker (for async photo deletion)
export const deletionWorker = new Worker(
  'storage-deletion',
  async (job) => {
    const { photoId, r2Key, thumbnailUrl, storageAccountId, fileSize } = job.data;

    console.log(`[DeletionWorker] Processing deletion job ${job.id} for photo ${photoId}`);

    try {
      await performPhotoDeletion({
        photoId,
        r2Key,
        thumbnailUrl,
        storageAccountId,
        fileSize: fileSize ? BigInt(fileSize) : undefined,
      });

      console.log(`[DeletionWorker] Successfully deleted photo ${photoId}`);
      return { success: true, photoId };
    } catch (error) {
      console.error(`[DeletionWorker] Failed to delete photo ${photoId}:`, error);
      throw error;
    }
  },
  {
    connection: redis,
    concurrency: 5, // Process 5 deletions concurrently
  }
);

// Error handlers
uploadWorker.on('failed', (job, err) => {
  console.error(`[UploadWorker] Job ${job?.id} failed:`, err);
});

thumbnailWorker.on('failed', (job, err) => {
  console.error(`[ThumbnailWorker] Job ${job?.id} failed:`, err);
});

notificationWorker.on('failed', (job, err) => {
  console.error(`[NotificationWorker] Job ${job?.id} failed:`, err);
});

deletionWorker.on('failed', (job, err) => {
  console.error(`[DeletionWorker] Job ${job?.id} failed:`, err);
});

// Graceful shutdown handlers
process.on('SIGTERM', async () => {
  console.log('[Workers] SIGTERM received, closing workers...');
  await uploadWorker.close();
  await thumbnailWorker.close();
  await notificationWorker.close();
  await deletionWorker.close();
  console.log('[Workers] All workers closed');
});

process.on('SIGINT', async () => {
  console.log('[Workers] SIGINT received, closing workers...');
  await uploadWorker.close();
  await thumbnailWorker.close();
  await notificationWorker.close();
  await deletionWorker.close();
  console.log('[Workers] All workers closed');
});

console.log('[Workers] All workers initialized');
