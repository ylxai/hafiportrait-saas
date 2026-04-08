/**
 * Cloudflare Queue Consumer Workers
 * Replaces: BullMQ Workers (src/lib/workers.ts)
 */

export interface Env {
  PHOTO_BUCKET: R2Bucket;
  THUMBNAIL_BUCKET: R2Bucket;
  DB: D1Database;
  UPLOAD_CACHE: KVNamespace;
  
  // Secrets
  CLOUDINARY_CLOUD_NAME: string;
  CLOUDINARY_API_KEY: string;
  CLOUDINARY_API_SECRET: string;
}

// ==================== THUMBNAIL GENERATION CONSUMER ====================

export const ThumbnailConsumer = {
  async queue(batch: MessageBatch<any>, env: Env, ctx: ExecutionContext) {
    console.log(`[ThumbnailConsumer] Processing ${batch.messages.length} jobs`);
    
    for (const message of batch.messages) {
      const { 
        uploadId, 
        r2Key, 
        galleryId, 
        filename, 
        fileSize, 
        width, 
        height,
        storageAccountId,
        contentType 
      } = message.body;
      
      try {
        // 1. Download dari R2
        const object = await env.PHOTO_BUCKET.get(r2Key);
        if (!object) {
          throw new Error(`File not found: ${r2Key}`);
        }
        
        const arrayBuffer = await object.arrayBuffer();
        const buffer = new Uint8Array(arrayBuffer);
        
        // 2. Get image dimensions if not provided
        let imgWidth = width || 0;
        let imgHeight = height || 0;
        
        if (!imgWidth || !imgHeight) {
          // Parse JPEG/PNG headers untuk get dimensions
          const dims = getImageDimensions(buffer);
          imgWidth = dims.width;
          imgHeight = dims.height;
        }
        
        // 3. Upload ke Cloudinary untuk thumbnail
        const formData = new FormData();
        formData.append('file', new Blob([buffer], { type: contentType }), filename);
        formData.append('folder', `gallery/${galleryId}`);
        
        const result = await fetch(
          `https://api.cloudinary.com/v1_1/${env.CLOUDINARY_CLOUD_NAME}/image/upload`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Basic ${btoa(`${env.CLOUDINARY_API_KEY}:${env.CLOUDINARY_API_SECRET}`)}`,
            },
            body: formData,
          }
        );
        
        if (!result.ok) {
          throw new Error(`Cloudinary upload failed: ${result.status}`);
        }
        
        const cloudinaryData = await result.json();
        const thumbnailUrl = cloudinaryData.secure_url;
        
        // 4. Save ke database
        const photoId = crypto.randomUUID();
        await env.DB.prepare(`
          INSERT INTO photos (id, galleryId, filename, url, thumbnailUrl, 
                             r2Key, width, height, fileSize, storageAccountId, createdAt)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        `).bind(
          photoId,
          galleryId,
          filename,
          `https://${env.PHOTO_BUCKET.bucketName}.r2.cloudflarestorage.com/${r2Key}`,
          thumbnailUrl,
          r2Key,
          imgWidth,
          imgHeight,
          fileSize,
          storageAccountId
        ).run();
        
        // 5. Update storage usage
        if (storageAccountId) {
          await env.DB.prepare(`
            UPDATE storage_accounts 
            SET usedStorage = usedStorage + ?, totalPhotos = totalPhotos + 1
            WHERE id = ?
          `).bind(fileSize, storageAccountId).run();
        }
        
        // 6. Update upload cache
        await env.UPLOAD_CACHE.put(`upload:${uploadId}`, JSON.stringify({
          status: 'completed',
          photoId,
          thumbnailUrl,
          filename,
        }), { expirationTtl: 3600 });
        
        // 7. Acknowledge message
        message.ack();
        
        console.log(`✅ Thumbnail generated: ${filename}`);
        
      } catch (error) {
        console.error(`❌ Failed: ${filename}`, error);
        message.retry();
      }
    }
  },
};

// ==================== STORAGE DELETION CONSUMER ====================

export const DeletionConsumer = {
  async queue(batch: MessageBatch<any>, env: Env, ctx: ExecutionContext) {
    console.log(`[DeletionConsumer] Processing ${batch.messages.length} deletions`);
    
    for (const message of batch.messages) {
      const { photoId, r2Key, thumbnailUrl, storageAccountId, fileSize } = message.body;
      
      try {
        let deleted = { r2: false, cloudinary: false, storage: false };
        
        // 1. Delete dari R2
        if (r2Key) {
          await env.PHOTO_BUCKET.delete(r2Key);
          deleted.r2 = true;
          console.log(`[Deletion] R2 deleted: ${r2Key}`);
        }
        
        // 2. Delete dari Cloudinary
        if (thumbnailUrl) {
          const publicId = extractCloudinaryPublicId(thumbnailUrl);
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
            deleted.cloudinary = true;
            console.log(`[Deletion] Cloudinary deleted: ${publicId}`);
          }
        }
        
        // 3. Update storage usage
        if (storageAccountId && fileSize) {
          await env.DB.prepare(`
            UPDATE storage_accounts 
            SET usedStorage = MAX(0, usedStorage - ?), 
                totalPhotos = MAX(0, totalPhotos - 1)
            WHERE id = ?
          `).bind(fileSize, storageAccountId).run();
          deleted.storage = true;
        }
        
        console.log(`✅ Deletion completed: ${photoId}`, deleted);
        message.ack();
        
      } catch (error) {
        console.error(`❌ Deletion failed: ${photoId}`, error);
        message.retry();
      }
    }
  },
};

// ==================== UPLOAD PROCESSING CONSUMER ====================

export const UploadConsumer = {
  async queue(batch: MessageBatch<any>, env: Env, ctx: ExecutionContext) {
    console.log(`[UploadConsumer] Processing ${batch.messages.length} uploads`);
    
    for (const message of batch.messages) {
      const { filename, galleryId, buffer } = message.body;
      
      try {
        // Process upload (simplified)
        console.log(`Processing upload: ${filename}`);
        message.ack();
      } catch (error) {
        console.error(`Upload failed: ${filename}`, error);
        message.retry();
      }
    }
  },
};

// ==================== HELPERS ====================

function getImageDimensions(buffer: Uint8Array): { width: number; height: number } {
  // Parse JPEG marker
  if (buffer[0] === 0xFF && buffer[1] === 0xD8) {
    let offset = 2;
    while (offset < buffer.length) {
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
  
  // Parse PNG
  if (buffer[0] === 0x89 && buffer[1] === 0x50) {
    const width = (buffer[16] << 24) | (buffer[17] << 16) | (buffer[18] << 8) | buffer[19];
    const height = (buffer[20] << 24) | (buffer[21] << 16) | (buffer[22] << 8) | buffer[23];
    return { width, height };
  }
  
  return { width: 0, height: 0 };
}

function extractCloudinaryPublicId(url: string): string | null {
  try {
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split('/');
    const uploadIndex = pathParts.indexOf('upload');
    if (uploadIndex !== -1) {
      const parts = pathParts.slice(uploadIndex + 1);
      if (parts[0]?.startsWith('v')) parts.shift();
      return parts.join('/');
    }
    return null;
  } catch {
    return null;
  }
}
