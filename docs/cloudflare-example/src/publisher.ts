/**
 * Hybrid Architecture: Cloudflare Queue Publisher
 * Di-deploy di VPS Next.js
 * 
 * Mengirim job ke Cloudflare Queue untuk processing di Workers
 */

const CLOUDFLARE_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID!;
const CLOUDFLARE_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN!;

interface QueueMessage {
  body: any;
  delay?: number;
}

/**
 * Publish message ke Cloudflare Queue via REST API
 */
export async function publishToQueue(
  queueName: string,
  message: any,
  options?: { delay?: number }
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/queues/${queueName}/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${CLOUDFLARE_API_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: [{
            body: message,
            delay: options?.delay,
          }],
        }),
      }
    );

    const data = await response.json();

    if (!response.ok || !data.success) {
      console.error('Failed to publish to queue:', data);
      return { 
        success: false, 
        error: data.errors?.[0]?.message || 'Unknown error' 
      };
    }

    return { 
      success: true, 
      messageId: data.result?.message_ids?.[0] 
    };
  } catch (error) {
    console.error('Error publishing to queue:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

/**
 * Queue upload untuk thumbnail generation
 */
export async function queueThumbnailGeneration(data: {
  uploadId: string;
  r2Key: string;
  publicUrl: string;
  galleryId: string;
  filename: string;
  fileSize: number;
  width?: number;
  height?: number;
  storageAccountId?: string;
}) {
  return publishToQueue('thumbnail-generation', {
    type: 'thumbnail-generation',
    timestamp: Date.now(),
    ...data,
  });
}

/**
 * Queue storage deletion
 */
export async function queueStorageDeletion(data: {
  photoId: string;
  r2Key?: string;
  thumbnailUrl?: string;
  storageAccountId?: string;
  fileSize?: number;
}) {
  return publishToQueue('storage-deletion', {
    type: 'storage-deletion',
    timestamp: Date.now(),
    ...data,
  });
}

/**
 * Fallback: Jika queue tidak available, proses langsung via BullMQ
 */
export async function queueWithFallback(
  queueName: string,
  message: any,
  bullMQQueue?: any
): Promise<{ success: boolean; method: 'cloudflare' | 'bullmq' | 'error' }> {
  // Coba Cloudflare Queue dulu
  const cfResult = await publishToQueue(queueName, message);
  
  if (cfResult.success) {
    return { success: true, method: 'cloudflare' };
  }
  
  // Fallback ke BullMQ jika tersedia
  if (bullMQQueue) {
    try {
      await bullMQQueue.add(queueName, message);
      console.log(`[Queue Fallback] Sent via BullMQ: ${queueName}`);
      return { success: true, method: 'bullmq' };
    } catch (bullMQError) {
      console.error('[Queue Fallback] BullMQ also failed:', bullMQError);
    }
  }
  
  return { success: false, method: 'error' };
}
