/**
 * Hybrid Architecture: Cloudflare Worker Consumer
 * Di-deploy sebagai Cloudflare Worker
 * 
 * Menerima job dari Queue dan melakukan processing
 * Kemudian callback ke VPS untuk save ke database
 */

export interface Env {
  // R2 untuk download file
  PHOTO_BUCKET: R2Bucket;
  
  // Secrets untuk Cloudinary
  CLOUDINARY_CLOUD_NAME: string;
  CLOUDINARY_API_KEY: string;
  CLOUDINARY_API_SECRET: string;
  
  // VPS Webhook untuk callback
  VPS_WEBHOOK_URL: string;
  VPS_WEBHOOK_SECRET: string;
}

// Interface untuk job data
interface ThumbnailJob {
  type: 'thumbnail-generation';
  uploadId: string;
  r2Key: string;
  publicUrl: string;
  galleryId: string;
  filename: string;
  fileSize: number;
  width?: number;
  height?: number;
  storageAccountId?: string;
}

interface DeletionJob {
  type: 'storage-deletion';
  photoId: string;
  r2Key?: string;
  thumbnailUrl?: string;
  storageAccountId?: string;
  fileSize?: number;
}

export default {
  async queue(batch: MessageBatch<any>, env: Env, ctx: ExecutionContext) {
    console.log(`[Worker] Processing ${batch.messages.length} jobs`);
    
    for (const message of batch.messages) {
      const job = message.body;
      
      try {
        let result: any;
        
        switch (job.type) {
          case 'thumbnail-generation':
            result = await processThumbnail(job as ThumbnailJob, env);
            break;
            
          case 'storage-deletion':
            result = await processDeletion(job as DeletionJob, env);
            break;
            
          default:
            console.error(`[Worker] Unknown job type: ${job.type}`);
            message.ack(); // Ack to prevent retry
            continue;
        }
        
        // Callback ke VPS untuk save ke database
        await callbackToVPS(job.type, result, env);
        
        // Acknowledge message (mark as done)
        message.ack();
        
        console.log(`[Worker] ✅ Job completed: ${job.type} - ${job.uploadId || job.photoId}`);
        
      } catch (error) {
        console.error(`[Worker] ❌ Job failed:`, error);
        
        // Retry dengan exponential backoff (default Cloudflare Queue)
        message.retry();
      }
    }
  },
};

/**
 * Process thumbnail generation
 */
async function processThumbnail(job: ThumbnailJob, env: Env): Promise<any> {
  console.log(`[Thumbnail] Processing: ${job.filename}`);
  
  // 1. Download dari R2
  const object = await env.PHOTO_BUCKET.get(job.r2Key);
  if (!object) {
    throw new Error(`File not found in R2: ${job.r2Key}`);
  }
  
  const arrayBuffer = await object.arrayBuffer();
  
  // 2. Get image dimensions
  let width = job.width || 0;
  let height = job.height || 0;
  
  if (!width || !height) {
    const dims = getImageDimensions(new Uint8Array(arrayBuffer));
    width = dims.width;
    height = dims.height;
  }
  
  // 3. Upload ke Cloudinary untuk thumbnail
  const formData = new FormData();
  formData.append('file', new Blob([arrayBuffer]), job.filename);
  formData.append('folder', `gallery/${job.galleryId}`);
  formData.append('transformation', 'w_400,h_400,c_fill,q_auto');
  
  const cloudinaryResponse = await fetch(
    `https://api.cloudinary.com/v1_1/${env.CLOUDINARY_CLOUD_NAME}/image/upload`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${btoa(`${env.CLOUDINARY_API_KEY}:${env.CLOUDINARY_API_SECRET}`)}`,
      },
      body: formData,
    }
  );
  
  if (!cloudinaryResponse.ok) {
    const error = await cloudinaryResponse.text();
    throw new Error(`Cloudinary upload failed: ${error}`);
  }
  
  const cloudinaryData = await cloudinaryResponse.json();
  
  return {
    uploadId: job.uploadId,
    galleryId: job.galleryId,
    filename: job.filename,
    url: job.publicUrl,
    thumbnailUrl: cloudinaryData.secure_url,
    publicId: cloudinaryData.public_id,
    width,
    height,
    fileSize: job.fileSize,
    storageAccountId: job.storageAccountId,
    r2Key: job.r2Key,
  };
}

/**
 * Process storage deletion
 */
async function processDeletion(job: DeletionJob, env: Env): Promise<any> {
  console.log(`[Deletion] Processing: ${job.photoId}`);
  
  const result = {
    photoId: job.photoId,
    r2Deleted: false,
    cloudinaryDeleted: false,
  };
  
  // 1. Delete dari R2
  if (job.r2Key) {
    try {
      await env.PHOTO_BUCKET.delete(job.r2Key);
      result.r2Deleted = true;
      console.log(`[Deletion] R2 deleted: ${job.r2Key}`);
    } catch (error) {
      console.error(`[Deletion] R2 deletion failed:`, error);
      throw error; // Will retry
    }
  }
  
  // 2. Delete dari Cloudinary
  if (job.thumbnailUrl) {
    try {
      const publicId = extractCloudinaryPublicId(job.thumbnailUrl);
      if (publicId) {
        await fetch(
          `https://api.cloudinary.com/v1_1/${env.CLOUDINARY_CLOUD_NAME}/image/destroy`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Basic ${btoa(`${env.CLOUDINARY_API_KEY}:${env.CLOUDINARY_API_SECRET}`)}`,
            },
            body: JSON.stringify({ public_id: publicId }),
          }
        );
        result.cloudinaryDeleted = true;
        console.log(`[Deletion] Cloudinary deleted: ${publicId}`);
      }
    } catch (error) {
      console.error(`[Deletion] Cloudinary deletion failed:`, error);
      throw error; // Will retry
    }
  }
  
  // Return data untuk storage usage update di VPS
  return {
    ...result,
    storageAccountId: job.storageAccountId,
    fileSize: job.fileSize,
  };
}

/**
 * Callback ke VPS untuk save ke database
 */
async function callbackToVPS(
  type: string,
  data: any,
  env: Env
): Promise<void> {
  const webhookUrl = `${env.VPS_WEBHOOK_URL}/${type === 'thumbnail-generation' ? 'photo-created' : 'storage-deleted'}`;
  
  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${env.VPS_WEBHOOK_SECRET}`,
    },
    body: JSON.stringify(data),
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`VPS callback failed: ${error}`);
  }
  
  console.log(`[Worker] ✅ Callback to VPS successful: ${type}`);
}

/**
 * Helper: Parse image dimensions dari JPEG/PNG buffer
 */
function getImageDimensions(buffer: Uint8Array): { width: number; height: number } {
  // JPEG
  if (buffer[0] === 0xFF && buffer[1] === 0xD8) {
    let offset = 2;
    while (offset < buffer.length - 10) {
      if (buffer[offset] === 0xFF) {
        const marker = buffer[offset + 1];
        if (marker === 0xC0 || marker === 0xC2) {
          return {
            height: (buffer[offset + 5] << 8) | buffer[offset + 6],
            width: (buffer[offset + 7] << 8) | buffer[offset + 8],
          };
        }
      }
      offset++;
    }
  }
  
  // PNG
  if (buffer[0] === 0x89 && buffer[1] === 0x50) {
    const width = (buffer[16] << 24) | (buffer[17] << 16) | (buffer[18] << 8) | buffer[19];
    const height = (buffer[20] << 24) | (buffer[21] << 16) | (buffer[22] << 8) | buffer[23];
    return { width, height };
  }
  
  return { width: 0, height: 0 };
}

/**
 * Helper: Extract Cloudinary public_id dari URL
 */
function extractCloudinaryPublicId(url: string): string | null {
  try {
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split('/');
    const uploadIndex = pathParts.indexOf('upload');
    if (uploadIndex !== -1) {
      const parts = pathParts.slice(uploadIndex + 1);
      if (parts[0]?.startsWith('v')) parts.shift(); // Remove version
      // Remove file extension
      const lastPart = parts[parts.length - 1];
      parts[parts.length - 1] = lastPart.replace(/\.[^/.]+$/, '');
      return parts.join('/');
    }
    return null;
  } catch {
    return null;
  }
}
