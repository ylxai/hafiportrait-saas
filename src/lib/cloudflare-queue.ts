/**
 * Cloudflare Queue Publisher
 * 
 * Used by Vercel (Next.js) to publish messages to Cloudflare Queue
 * 
 * Environment variables needed:
 * - CLOUDFLARE_ACCOUNT_ID
 * - NEXT_SERVER_CF_QUEUE_TOKEN (with Queue write permission)
 */

const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const API_TOKEN = process.env.NEXT_SERVER_CF_QUEUE_TOKEN;


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
 * Publish multiple messages to Cloudflare Queue via REST API
 */
export async function publishToQueueBulk(
  queueName: string,
  messages: unknown[]
): Promise<{ success: boolean; error?: string }> {
  if (!ACCOUNT_ID || !API_TOKEN) {
    console.error('[Queue Publisher] Missing Cloudflare credentials');
    return { success: false, error: 'Missing credentials' };
  }

  // Cloudflare API accepts up to 100 messages per request
  const BATCH_SIZE = 100;
  try {
    for (let i = 0; i < messages.length; i += BATCH_SIZE) {
      const batch = messages.slice(i, i + BATCH_SIZE);
      const response = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/queues/${queueName}/messages`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${API_TOKEN}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messages: batch.map(msg => ({ body: msg })),
          }),
        }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        console.error('[Queue Publisher] Bulk Failed:', data);
        return {
          success: false,
          error: data.errors?.[0]?.message || 'Failed to publish batch',
        };
      }
    }

    return { success: true };
  } catch (error) {
    console.error('[Queue Publisher] Bulk Error:', error);
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
 * Queue multiple storage deletion jobs in bulk
 */
export async function queueStorageDeletionBulk(dataList: Array<{
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
}>): Promise<{ success: boolean; error?: string }> {
  const timestamp = Date.now();
  const messages = dataList.map(data => ({
    type: 'storage-deletion',
    timestamp,
    photoId: data.photoId,
    r2Key: data.r2Key || undefined,
    thumbnailUrl: data.thumbnailUrl || undefined,
    fileSize: data.fileSize,
    storageAccountId: data.storageAccountId || undefined,
    cloudinaryCredentials: data.cloudinaryCredentials || undefined,
  }));

  return publishToQueueBulk('storage-deletion', messages);
}

/**
 * Check if Cloudflare Queue is configured
 */
export function isQueueConfigured(): boolean {
  return !!ACCOUNT_ID && !!API_TOKEN;
}
