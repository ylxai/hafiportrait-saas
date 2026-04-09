/**
 * Cloudflare Queue Publisher
 * 
 * Used by Vercel (Next.js) to publish messages to Cloudflare Queue
 * 
 * Environment variables needed:
 * - CLOUDFLARE_ACCOUNT_ID
 * - NEXT_SERVER_CF_QUEUE_TOKEN (with Queue write permission)
 */

import { prisma } from '@/lib/db';
import { Prisma } from '@/generated/prisma';

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
  fileSize?: string;
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
  fileSize?: string;
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

/**
 * Queue photos deletion for entities before deleting them from DB.
 * Use this for bulk deletes or cascading deletes (Gallery, Event, Client)
 * where deleting the parent entity would orphan files in storage.
 */
export async function queuePhotosDeletionForEntities(whereCriteria: Prisma.PhotoWhereInput): Promise<void> {
  if (!isQueueConfigured()) return;
  
  const photos = await prisma.photo.findMany({
    where: whereCriteria,
  });

  if (photos.length === 0) return;

  const defaultCloudinaryAccount = await prisma.storageAccount.findFirst({
    where: { provider: 'CLOUDINARY', isActive: true },
    orderBy: [{ isDefault: 'desc' }, { priority: 'asc' }],
  });

  const cloudinaryCredentials = defaultCloudinaryAccount ? {
    cloudName: defaultCloudinaryAccount.cloudName,
    apiKey: defaultCloudinaryAccount.apiKey,
    apiSecret: defaultCloudinaryAccount.apiSecret,
  } : null;

  const deletionJobs = photos.map(photo => ({
    photoId: photo.id,
    r2Key: photo.r2Key,
    thumbnailUrl: photo.thumbnailUrl,
    storageAccountId: photo.storageAccountId,
    fileSize: photo.fileSize?.toString(),
    cloudinaryCredentials,
  })).filter(job => job.r2Key || job.thumbnailUrl);

  if (deletionJobs.length > 0) {
    try {
      await queueStorageDeletionBulk(deletionJobs);
      console.log(`[Delete] Queued ${deletionJobs.length} associated photos to Cloudflare Queue`);
    } catch (cfError) {
      console.error(`[Delete] Cloudflare Queue bulk error:`, cfError);
    }
  }
}
