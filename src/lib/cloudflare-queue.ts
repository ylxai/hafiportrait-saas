/**
 * Cloudflare Queue Publisher
 * 
 * Used by Vercel (Next.js) to publish messages to Cloudflare Queue
 * 
 * Environment variables needed:
 * - CLOUDFLARE_ACCOUNT_ID
 * - CLOUDFLARE_API_TOKEN (with Queue write permission)
 */

const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;


/**
 * Publish message to Cloudflare Queue via REST API
 */
export async function publishToQueue(
  queueName: string,
  message: unknown,
  options?: { delaySeconds?: number }
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  if (!ACCOUNT_ID || !API_TOKEN) {
    console.error('[Queue Publisher] Missing Cloudflare credentials');
    return { success: false, error: 'Missing credentials' };
  }

  try {
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/queues/${queueName}/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${API_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: [{
            body: message,
            delay_seconds: options?.delaySeconds,
          }],
        }),
      }
    );

    const data = await response.json();

    if (!response.ok || !data.success) {
      console.error('[Queue Publisher] Failed:', data);
      return {
        success: false,
        error: data.errors?.[0]?.message || 'Failed to publish',
      };
    }

    return {
      success: true,
      messageId: data.result?.message_ids?.[0],
    };
  } catch (error) {
    console.error('[Queue Publisher] Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Queue storage deletion job
 */
export async function queueStorageDeletion(data: {
  photoId: string;
  r2Key?: string | null;
  thumbnailUrl?: string | null;
  fileSize?: number;
  storageAccountId?: string | null;
  cloudinaryCredentials?: {
    cloudName?: string | null;
    apiKey?: string | null;
    apiSecret?: string | null;
  } | null;
}): Promise<{ success: boolean; messageId?: string; error?: string }> {
  return publishToQueue('storage-deletion', {
    type: 'storage-deletion',
    timestamp: Date.now(),
    photoId: data.photoId,
    r2Key: data.r2Key || undefined,
    thumbnailUrl: data.thumbnailUrl || undefined,
    fileSize: data.fileSize,
    storageAccountId: data.storageAccountId || undefined,
    cloudinaryCredentials: data.cloudinaryCredentials || undefined,
  });
}

/**
 * Check if Cloudflare Queue is configured
 */
export function isQueueConfigured(): boolean {
  return !!ACCOUNT_ID && !!API_TOKEN;
}
