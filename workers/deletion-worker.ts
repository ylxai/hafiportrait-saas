/**
 * Cloudflare Workers - Storage Deletion Worker
 * 
 * This worker handles deletion of photos from:
 * 1. R2 Storage (original files)
 * 2. Cloudinary (thumbnails)
 * 
 * Cloudinary credentials are provided via message body (from database)
 * After deletion, it calls back to Vercel webhook to update database
 */

export interface Env {
  // R2 Bucket binding
  PHOTO_BUCKET: R2Bucket;
  
  // Vercel webhook for database update
  VPS_WEBHOOK_URL: string;
  VPS_WEBHOOK_SECRET: string;
}

interface DeletionJob {
  type: 'storage-deletion';
  photoId: string;
  r2Key?: string;
  thumbnailUrl?: string;
  fileSize?: number;
  storageAccountId?: string;
  // Cloudinary credentials from database (via message)
  cloudinaryCredentials?: {
    cloudName?: string;
    apiKey?: string;
    apiSecret?: string;
  };
}

export default {
  async queue(batch: MessageBatch<any>, env: Env, ctx: ExecutionContext) {
    console.log(`[DeletionWorker] Processing ${batch.messages.length} deletion jobs`);
    
    for (const message of batch.messages) {
      const job = message.body as DeletionJob;
      
      try {
        const result = await processDeletion(job, env);
        
        // Callback to Vercel to update database
        await callbackToVercel(job, result, env);
        
        // Acknowledge message (mark as done)
        message.ack();
        
        console.log(`[DeletionWorker] ✅ Deleted: ${job.photoId}`);
        
      } catch (error) {
        console.error(`[DeletionWorker] ❌ Failed: ${job.photoId}`, error);
        
        // Retry with exponential backoff (handled by Cloudflare Queue)
        message.retry();
      }
    }
  },
};

async function processDeletion(job: DeletionJob, env: Env): Promise<{
  r2Deleted: boolean;
  cloudinaryDeleted: boolean;
}> {
  const result = {
    r2Deleted: false,
    cloudinaryDeleted: false,
  };

  // 1. Delete from R2 (original file)
  if (job.r2Key) {
    try {
      await env.PHOTO_BUCKET.delete(job.r2Key);
      result.r2Deleted = true;
      console.log(`[DeletionWorker] R2 deleted: ${job.r2Key}`);
    } catch (error) {
      console.error(`[DeletionWorker] R2 deletion failed:`, error);
      throw new Error(`R2 deletion failed: ${error}`);
    }
  }

  // 2. Delete from Cloudinary (thumbnail)
  // Credentials provided via message body (from database)
  if (job.thumbnailUrl && job.cloudinaryCredentials) {
    const { cloudName, apiKey, apiSecret } = job.cloudinaryCredentials;
    
    if (cloudName && apiKey && apiSecret) {
      try {
        const publicId = extractCloudinaryPublicId(job.thumbnailUrl);
        if (publicId) {
          await deleteFromCloudinary(publicId, cloudName, apiKey, apiSecret);
          result.cloudinaryDeleted = true;
          console.log(`[DeletionWorker] Cloudinary deleted: ${publicId}`);
        }
      } catch (error) {
        console.error(`[DeletionWorker] Cloudinary deletion failed:`, error);
        // Don't throw here - R2 deletion is more critical
        // Cloudinary cleanup can be done via periodic cleanup job
      }
    } else {
      console.warn(`[DeletionWorker] Incomplete Cloudinary credentials, skipping thumbnail deletion`);
    }
  }

  return result;
}

async function deleteFromCloudinary(
  publicId: string,
  cloudName: string,
  apiKey: string,
  apiSecret: string
): Promise<void> {
  const timestamp = Math.round(Date.now() / 1000);
  
  // Generate signature
  const signature = await generateCloudinarySignature(
    { public_id: publicId, timestamp },
    apiSecret
  );

  const formData = new FormData();
  formData.append('public_id', publicId);
  formData.append('timestamp', timestamp.toString());
  formData.append('api_key', apiKey);
  formData.append('signature', signature);

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${cloudName}/image/destroy`,
    {
      method: 'POST',
      body: formData,
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Cloudinary destroy failed: ${error}`);
  }
}

async function callbackToVercel(
  job: DeletionJob,
  result: { r2Deleted: boolean; cloudinaryDeleted: boolean },
  env: Env
): Promise<void> {
  const webhookUrl = `${env.VPS_WEBHOOK_URL}/storage-deleted`;
  
  const payload = {
    photoId: job.photoId,
    r2Deleted: result.r2Deleted,
    cloudinaryDeleted: result.cloudinaryDeleted,
    storageAccountId: job.storageAccountId,
    fileSize: job.fileSize,
  };

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${env.VPS_WEBHOOK_SECRET}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Vercel callback failed: ${error}`);
  }

  console.log(`[DeletionWorker] ✅ Callback to Vercel successful`);
}

// Helper: Extract Cloudinary public_id from URL
function extractCloudinaryPublicId(url: string): string | null {
  try {
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split('/');
    const uploadIndex = pathParts.indexOf('upload');
    
    if (uploadIndex !== -1) {
      const parts = pathParts.slice(uploadIndex + 1);
      
      // Remove version number (e.g., v1234567890)
      if (parts[0]?.startsWith('v')) {
        parts.shift();
      }
      
      // Remove file extension
      const lastPart = parts[parts.length - 1];
      if (lastPart) {
        parts[parts.length - 1] = lastPart.replace(/\.[^/.]+$/, '');
      }
      
      return parts.join('/');
    }
    
    return null;
  } catch {
    return null;
  }
}

// Helper: Generate Cloudinary signature using Web Crypto API
async function generateCloudinarySignature(
  params: Record<string, any>,
  apiSecret: string
): Promise<string> {
  // Sort params alphabetically
  const sortedParams = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join('&') + apiSecret;
  
  // Generate SHA1 signature using Web Crypto API
  const encoder = new TextEncoder();
  const data = encoder.encode(sortedParams);
  const hashBuffer = await crypto.subtle.digest('SHA-1', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  
  // Convert to hex string
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
