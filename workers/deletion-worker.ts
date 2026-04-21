/**
 * Cloudflare Workers - Storage Deletion Worker
 *
 * This worker handles deletion of photos from:
 * 1. R2 Storage (original files)
 * 2. Cloudinary (thumbnails)
 *
 * Cloudinary credentials are provided via message body (from database)
 * After deletion, it calls back to Vercel webhook to update database
 *
 * This worker also handles scheduled cleanup of expired upload sessions
 * via Cloudflare Cron Triggers (every 30 minutes).
 */

export interface Env {
  // R2 Bucket binding
  PHOTO_BUCKET: R2Bucket;

  // Queue bindings
  THUMBNAIL_QUEUE: Queue<ThumbnailJob>;
  DELETION_QUEUE: Queue<DeletionJob>;

  // Vercel webhook for database update
  VPS_WEBHOOK_URL: string;
  VPS_WEBHOOK_SECRET: string;

  // VPS cleanup endpoint (for scheduled upload session cleanup)
  VPS_CLEANUP_URL?: string;
  VPS_CLEANUP_SECRET?: string;
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

interface ThumbnailJob {
  type: 'thumbnail-generation';
  photoId: string;
  r2Key: string;
  galleryId: string;
  filename: string;
  // Cloudinary credentials from database (via message)
  cloudinaryCredentials: {
    cloudName: string;
    apiKey: string;
    apiSecret: string;
  };
}

type QueueMessage = DeletionJob | ThumbnailJob;

export default {
  // Handle HTTP requests (for publishing to queue from Next.js)
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // POST /queue/thumbnail - Publish thumbnail generation job
    if (url.pathname === '/queue/thumbnail' && request.method === 'POST') {
      try {
        const body = await request.json() as ThumbnailJob;
        await env.THUMBNAIL_QUEUE.send(body);
        return new Response(JSON.stringify({ success: true }), {
          headers: { 'Content-Type': 'application/json' },
        });
      } catch (error) {
        return new Response(JSON.stringify({ success: false, error: String(error) }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    // POST /queue/deletion - Publish deletion job
    if (url.pathname === '/queue/deletion' && request.method === 'POST') {
      try {
        const body = await request.json() as DeletionJob;
        await env.DELETION_QUEUE.send(body);
        return new Response(JSON.stringify({ success: true }), {
          headers: { 'Content-Type': 'application/json' },
        });
      } catch (error) {
        return new Response(JSON.stringify({ success: false, error: String(error) }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    return new Response('Not Found', { status: 404 });
  },

  // Handle queue messages (deletion + thumbnail jobs)
  async queue(batch: MessageBatch<QueueMessage>, env: Env, ctx: ExecutionContext) {
    const deletionMessages = batch.messages.filter(m => m.body.type === 'storage-deletion');
    const thumbnailMessages = batch.messages.filter(m => m.body.type === 'thumbnail-generation');

    console.log(`[DeletionWorker] Processing ${deletionMessages.length} deletion jobs, ${thumbnailMessages.length} thumbnail jobs`);

    // Process deletion jobs
    for (const message of deletionMessages) {
      const job = message.body as DeletionJob;

      try {
        const result = await processDeletion(job, env);
        await callbackToVercel(job, result, env);
        message.ack();
        console.log(`[DeletionWorker] ✅ Deleted: ${job.photoId}`);
      } catch (error) {
        console.error(`[DeletionWorker] ❌ Failed: ${job.photoId}`, error);
        message.retry();
      }
    }

    // Process thumbnail jobs
    for (const message of thumbnailMessages) {
      const job = message.body as ThumbnailJob;

      try {
        const result = await processThumbnail(job, env);
        if (result) {
          await callbackThumbnailToVercel(job, result, env);
        }
        message.ack();
        console.log(`[DeletionWorker] ✅ Thumbnail generated: ${job.photoId}`);
      } catch (error) {
        console.error(`[DeletionWorker] ❌ Thumbnail failed: ${job.photoId}`, error);
        message.retry();
      }
    }
  },

  // Handle cron-triggered scheduled events (upload session cleanup)
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    console.log('[DeletionWorker] Running scheduled upload session cleanup');

    if (!env.VPS_CLEANUP_URL || !env.VPS_CLEANUP_SECRET) {
      console.warn('[DeletionWorker] VPS_CLEANUP_URL or VPS_CLEANUP_SECRET not configured, skipping cleanup');
      return;
    }

    try {
      const response = await fetch(`${env.VPS_CLEANUP_URL}/api/admin/upload/cleanup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${env.VPS_CLEANUP_SECRET}`,
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[DeletionWorker] Cleanup endpoint returned ${response.status}: ${errorText}`);
        return;
      }

      const result = await response.json();
      console.log(`[DeletionWorker] ✅ Cleanup successful:`, result);
    } catch (error) {
      console.error('[DeletionWorker] Failed to run scheduled cleanup:', error);
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

// ─── Thumbnail Generation ───────────────────────────────────────

async function processThumbnail(
  job: ThumbnailJob,
  env: Env
): Promise<{ thumbnailUrl: string; publicId: string; mediumUrl: string; smallUrl: string } | null> {
  const { r2Key, cloudinaryCredentials, galleryId, filename } = job;
  const { cloudName, apiKey, apiSecret } = cloudinaryCredentials;

  if (!cloudName || !apiKey || !apiSecret) {
    console.warn(`[Thumbnail] Missing credentials for ${job.photoId}`);
    return null;
  }

  // Fetch image from R2 bucket via binding (no auth needed)
  const r2Object = await env.PHOTO_BUCKET.get(r2Key);
  if (!r2Object) {
    throw new Error(`R2 object not found: ${r2Key}`);
  }

  const imageBuffer = await r2Object.arrayBuffer();

  // Upload to Cloudinary with transformations
  const publicId = await uploadToCloudinaryWithTransform(
    imageBuffer,
    `photos/${galleryId}`,
    filename,
    cloudName,
    apiKey,
    apiSecret
  );

  if (!publicId) {
    throw new Error('Cloudinary upload returned no publicId');
  }

  // Generate thumbnail URLs for different sizes
  const thumbnailUrl = generateCloudinaryUrl(publicId, {
    cloudName,
    width: 400,
    height: 400,
    quality: 'auto',
    format: 'auto',
    crop: 'fill',
  });

  const mediumUrl = generateCloudinaryUrl(publicId, {
    cloudName,
    width: 800,
    quality: 'auto',
    format: 'auto',
    crop: 'limit',
  });

  const smallUrl = generateCloudinaryUrl(publicId, {
    cloudName,
    width: 200,
    quality: 'auto:low',
    format: 'auto',
    crop: 'scale',
  });

  console.log(`[Thumbnail] Generated for ${filename}: ${publicId}`);
  return { thumbnailUrl, publicId, mediumUrl, smallUrl };
}

async function uploadToCloudinaryWithTransform(
  imageBuffer: ArrayBuffer,
  folder: string,
  filename: string,
  cloudName: string,
  apiKey: string,
  apiSecret: string
): Promise<string | null> {
  const timestamp = Math.round(Date.now() / 1000);
  const publicIdBase = filename.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_');
  const publicId = `${folder}/${publicIdBase}`;

  // Build upload params for signed upload
  const paramsToSign: Record<string, string> = {
    timestamp: timestamp.toString(),
    folder,
    public_id: publicId,
    quality: 'auto',
    fetch_format: 'auto',
    resource_type: 'image',
  };

  const signature = await generateCloudinarySignature(paramsToSign, apiSecret);

  // Build form data
  const formData = new FormData();
  formData.append('file', new Blob([imageBuffer]), filename);
  formData.append('api_key', apiKey);
  formData.append('timestamp', paramsToSign.timestamp);
  formData.append('folder', folder);
  formData.append('public_id', publicId);
  formData.append('quality', 'auto');
  formData.append('fetch_format', 'auto');
  formData.append('signature', signature);

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
    {
      method: 'POST',
      body: formData,
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Cloudinary upload failed: ${error}`);
  }

  const data = await response.json() as { public_id: string };
  return data.public_id || null;
}

function generateCloudinaryUrl(
  publicId: string,
  options: {
    cloudName: string;
    width?: number;
    height?: number;
    quality?: string;
    format?: string;
    crop?: string;
  }
): string {
  const { cloudName, width, height, quality = 'auto', format = 'auto', crop = 'fill' } = options;

  const transforms: string[] = [];
  if (width) transforms.push(`w_${width}`);
  if (height) transforms.push(`h_${height}`);
  transforms.push(`c_${crop}`);
  transforms.push(`q_${quality}`);
  transforms.push(`f_${format}`);

  return `https://res.cloudinary.com/${cloudName}/image/upload/${transforms.join(',')}/${publicId}`;
}

async function callbackThumbnailToVercel(
  job: ThumbnailJob,
  result: { thumbnailUrl: string; publicId: string; mediumUrl: string; smallUrl: string },
  env: Env
): Promise<void> {
  const webhookUrl = `${env.VPS_WEBHOOK_URL}/thumbnail-generated`;

  const payload = {
    photoId: job.photoId,
    thumbnailUrl: result.thumbnailUrl,
    mediumUrl: result.mediumUrl,
    smallUrl: result.smallUrl,
    publicId: result.publicId,
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
    throw new Error(`Thumbnail callback failed: ${error}`);
  }

  console.log(`[Thumbnail] ✅ Callback to Vercel successful for ${job.photoId}`);
}

// ─── Cloudinary Helpers ─────────────────────────────────────────

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
