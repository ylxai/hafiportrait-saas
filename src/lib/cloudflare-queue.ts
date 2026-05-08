/**
 * Cloudflare Queue Publisher with Enhanced Error Handling
 * 
 * Used by Vercel (Next.js) to publish messages to Cloudflare Queue
 * 
 * Features:
 * - Retry logic with exponential backoff
 * - Error tracking and logging
 * - Batch processing for bulk operations
 * 
 * Environment variables needed:
 * - CLOUDFLARE_ACCOUNT_ID
 * - NEXT_SERVER_CF_QUEUE_TOKEN (with Queue write permission)
 */

import { prisma } from '@/lib/db';
import { Prisma } from '@/generated/prisma';
import { recordFailedJob } from '@/lib/failed-jobs';

const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const API_TOKEN = process.env.NEXT_SERVER_CF_QUEUE_TOKEN;
const WORKER_URL = process.env.CLOUDFLARE_WORKER_URL || 'https://photostudio-deletion-worker.masipah1973.workers.dev';

// Retry configuration
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY_MS = 1000; // 1 second
const MAX_RETRY_DELAY_MS = 10000; // 10 seconds

/**
 * Sleep utility for retry delays
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Calculate exponential backoff delay
 */
function getRetryDelay(attempt: number): number {
  const delay = INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt);
  return Math.min(delay, MAX_RETRY_DELAY_MS);
}

/**
 * Enhanced error logging with context
 */
function logQueueError(context: string, error: unknown, metadata?: Record<string, unknown>): void {
  const errorMessage = error instanceof Error ? error.message : 'Unknown error';
  const errorStack = error instanceof Error ? error.stack : undefined;
  
  console.error(`[Queue Error] ${context}`, {
    error: errorMessage,
    stack: errorStack,
    timestamp: new Date().toISOString(),
    ...metadata,
  });
}

/**
 * Publish message to Cloudflare Queue via REST API with retry logic
 */
export async function publishToQueue(
  queueName: string,
  message: unknown,
  options?: { delaySeconds?: number }
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  if (!ACCOUNT_ID || !API_TOKEN) {
    logQueueError('Missing credentials', new Error('CLOUDFLARE_ACCOUNT_ID or NEXT_SERVER_CF_QUEUE_TOKEN not set'));
    return { success: false, error: 'Missing credentials' };
  }

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
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
        const errorMsg = data.errors?.[0]?.message || 'Failed to publish';
        lastError = new Error(errorMsg);
        
        // Log error with attempt number
        logQueueError(`Publish failed (attempt ${attempt + 1}/${MAX_RETRIES + 1})`, lastError, {
          queueName,
          statusCode: response.status,
          responseData: data,
        });

        // Don't retry on client errors (4xx)
        if (response.status >= 400 && response.status < 500) {
          return { success: false, error: errorMsg };
        }

        // Retry on server errors (5xx) or network issues
        if (attempt < MAX_RETRIES) {
          const delay = getRetryDelay(attempt);
          console.log(`[Queue] Retrying in ${delay}ms...`);
          await sleep(delay);
          continue;
        }

        return { success: false, error: errorMsg };
      }

      // Success
      if (attempt > 0) {
        console.log(`[Queue] Successfully published after ${attempt + 1} attempts`);
      }

      return {
        success: true,
        messageId: data.result?.message_ids?.[0],
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Unknown error');
      
      logQueueError(`Network error (attempt ${attempt + 1}/${MAX_RETRIES + 1})`, lastError, {
        queueName,
      });

      // Retry on network errors
      if (attempt < MAX_RETRIES) {
        const delay = getRetryDelay(attempt);
        console.log(`[Queue] Retrying in ${delay}ms...`);
        await sleep(delay);
        continue;
      }

      return {
        success: false,
        error: lastError.message,
      };
    }
  }

  // Should never reach here, but TypeScript needs it
  return {
    success: false,
    error: lastError?.message || 'Max retries exceeded',
  };
}

/**
 * Publish multiple messages to Cloudflare Queue via REST API with retry logic
 */
export async function publishToQueueBulk(
  queueName: string,
  messages: unknown[]
): Promise<{ success: boolean; error?: string; failedCount?: number }> {
  if (!ACCOUNT_ID || !API_TOKEN) {
    logQueueError('Missing credentials', new Error('CLOUDFLARE_ACCOUNT_ID or NEXT_SERVER_CF_QUEUE_TOKEN not set'));
    return { success: false, error: 'Missing credentials' };
  }

  // Cloudflare API accepts up to 100 messages per request
  const BATCH_SIZE = 100;
  let failedBatches = 0;
  let lastError: string | undefined;

  try {
    for (let i = 0; i < messages.length; i += BATCH_SIZE) {
      const batch = messages.slice(i, i + BATCH_SIZE);
      const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(messages.length / BATCH_SIZE);

      let batchSuccess = false;
      let batchLastError: Error | undefined;

      // Retry logic for each batch
      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
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
                messages: batch.map(msg => ({ body: msg })),
              }),
            }
          );

          const data = await response.json();

          if (!response.ok || !data.success) {
            const errorMsg = data.errors?.[0]?.message || 'Failed to publish batch';
            batchLastError = new Error(errorMsg);
            
            logQueueError(`Bulk publish batch ${batchNumber}/${totalBatches} failed (attempt ${attempt + 1}/${MAX_RETRIES + 1})`, batchLastError, {
              queueName,
              batchSize: batch.length,
              statusCode: response.status,
            });

            // Don't retry on client errors (4xx)
            if (response.status >= 400 && response.status < 500) {
              lastError = errorMsg;
              failedBatches++;
              break;
            }

            // Retry on server errors (5xx)
            if (attempt < MAX_RETRIES) {
              const delay = getRetryDelay(attempt);
              console.log(`[Queue] Retrying batch ${batchNumber}/${totalBatches} in ${delay}ms...`);
              await sleep(delay);
              continue;
            }

            lastError = errorMsg;
            failedBatches++;
            break;
          }

          // Success
          batchSuccess = true;
          if (attempt > 0) {
            console.log(`[Queue] Batch ${batchNumber}/${totalBatches} succeeded after ${attempt + 1} attempts`);
          }
          break;
        } catch (error) {
          batchLastError = error instanceof Error ? error : new Error('Unknown error');
          
          logQueueError(`Network error for batch ${batchNumber}/${totalBatches} (attempt ${attempt + 1}/${MAX_RETRIES + 1})`, batchLastError, {
            queueName,
            batchSize: batch.length,
          });

          // Retry on network errors
          if (attempt < MAX_RETRIES) {
            const delay = getRetryDelay(attempt);
            console.log(`[Queue] Retrying batch ${batchNumber}/${totalBatches} in ${delay}ms...`);
            await sleep(delay);
            continue;
          }

          lastError = batchLastError.message;
          failedBatches++;
          break;
        }
      }

      if (!batchSuccess) {
        console.error(`[Queue] Batch ${batchNumber}/${totalBatches} failed after all retries`);
      }
    }

    if (failedBatches > 0) {
      return {
        success: false,
        error: lastError || 'Some batches failed',
        failedCount: failedBatches,
      };
    }

    return { success: true };
  } catch (error) {
    logQueueError('Bulk publish error', error, {
      queueName,
      totalMessages: messages.length,
    });
    
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
  try {
    const response = await fetch(`${WORKER_URL}/queue/deletion`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'storage-deletion',
        timestamp: Date.now(),
        photoId: data.photoId,
        r2Key: data.r2Key || undefined,
        thumbnailUrl: data.thumbnailUrl || undefined,
        fileSize: data.fileSize,
        storageAccountId: data.storageAccountId || undefined,
        cloudinaryCredentials: data.cloudinaryCredentials || undefined,
      }),
    });

    const result = await response.json();
    if (!result.success) {
      // Record failed job after queue publish fails
      await recordFailedJob({
        jobType: 'storage-deletion',
        payload: {
          photoId: data.photoId,
          r2Key: data.r2Key,
          thumbnailUrl: data.thumbnailUrl,
          fileSize: data.fileSize,
          storageAccountId: data.storageAccountId,
          cloudinaryCredentials: data.cloudinaryCredentials ? {
            cloudName: data.cloudinaryCredentials.cloudName,
            apiKey: data.cloudinaryCredentials.apiKey,
            apiSecret: '[REDACTED]',
          } : undefined,
        },
        errorMessage: result.error || 'Worker returned failure',
      }).catch((err) => {
        console.error('[Queue/Deletion] Failed to record failed job:', err);
      });
      return { success: false, error: result.error || 'Failed to queue' };
    }
    return { success: true };
  } catch (error) {
    console.error('[Queue/Deletion] Failed to publish:', error);
    // Record failed job on exception
    await recordFailedJob({
      jobType: 'storage-deletion',
      payload: {
        photoId: data.photoId,
        r2Key: data.r2Key,
        thumbnailUrl: data.thumbnailUrl,
        fileSize: data.fileSize,
        storageAccountId: data.storageAccountId,
        cloudinaryCredentials: data.cloudinaryCredentials ? {
          cloudName: data.cloudinaryCredentials.cloudName,
          apiKey: data.cloudinaryCredentials.apiKey,
          apiSecret: '[REDACTED]',
        } : undefined,
      },
      errorMessage: String(error),
    }).catch((err) => {
      console.error('[Queue/Deletion] Failed to record failed job:', err);
    });
    return { success: false, error: String(error) };
  }
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
}>): Promise<{ success: boolean; error?: string; failedCount?: number }> {
  // Send each deletion job individually to Worker HTTP endpoint
  let failedCount = 0;
  let lastError: string | undefined;

  for (const data of dataList) {
    const result = await queueStorageDeletion(data);
    if (!result.success) {
      failedCount++;
      lastError = result.error;
    }
  }

  if (failedCount > 0) {
    return {
      success: false,
      error: lastError || 'Some deletions failed',
      failedCount,
    };
  }

  return { success: true };
}

/**
 * Queue thumbnail generation job
 */
export async function queueThumbnailGeneration(data: {
  photoId: string;
  r2Key: string;
  galleryId: string;
  filename: string;
  cloudinaryCredentials: {
    cloudName: string | null;
    apiKey: string | null;
    apiSecret: string | null;
  };
}): Promise<{ success: boolean; messageId?: string; error?: string }> {
  if (!data.cloudinaryCredentials.cloudName || !data.cloudinaryCredentials.apiKey || !data.cloudinaryCredentials.apiSecret) {
    console.warn('[Queue/Thumbnail] Missing Cloudinary credentials, skipping thumbnail generation');
    return { success: false, error: 'Missing Cloudinary credentials' };
  }

  try {
    const response = await fetch(`${WORKER_URL}/queue/thumbnail`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'thumbnail-generation',
        timestamp: Date.now(),
        photoId: data.photoId,
        r2Key: data.r2Key,
        galleryId: data.galleryId,
        filename: data.filename,
        cloudinaryCredentials: {
          cloudName: data.cloudinaryCredentials.cloudName,
          apiKey: data.cloudinaryCredentials.apiKey,
          apiSecret: data.cloudinaryCredentials.apiSecret,
        },
      }),
    });

    const result = await response.json();
    if (!result.success) {
      // Record failed job after queue publish fails
      await recordFailedJob({
        jobType: 'thumbnail-generation',
        payload: {
          photoId: data.photoId,
          r2Key: data.r2Key,
          galleryId: data.galleryId,
          filename: data.filename,
          cloudinaryCredentials: {
            cloudName: data.cloudinaryCredentials.cloudName,
            apiKey: data.cloudinaryCredentials.apiKey,
            apiSecret: '[REDACTED]',
          },
        },
        errorMessage: result.error || 'Worker returned failure',
      }).catch((err) => {
        console.error('[Queue/Thumbnail] Failed to record failed job:', err);
      });
      return { success: false, error: result.error || 'Failed to queue' };
    }
    return { success: true };
  } catch (error) {
    console.error('[Queue/Thumbnail] Failed to publish:', error);
    // Record failed job on exception
    await recordFailedJob({
      jobType: 'thumbnail-generation',
      payload: {
        photoId: data.photoId,
        r2Key: data.r2Key,
        galleryId: data.galleryId,
        filename: data.filename,
        cloudinaryCredentials: {
          cloudName: data.cloudinaryCredentials.cloudName,
          apiKey: data.cloudinaryCredentials.apiKey,
          apiSecret: '[REDACTED]',
        },
      },
      errorMessage: String(error),
    }).catch((err) => {
      console.error('[Queue/Thumbnail] Failed to record failed job:', err);
    });
    return { success: false, error: String(error) };
  }
}

/**
 * Queue multiple thumbnail generation jobs in bulk
 */
export async function queueThumbnailGenerationBulk(dataList: Array<{
  photoId: string;
  r2Url: string;
  galleryId: string;
  filename: string;
  cloudinaryCredentials: {
    cloudName: string | null;
    apiKey: string | null;
    apiSecret: string | null;
  };
}>): Promise<{ success: boolean; error?: string; failedCount?: number }> {
  const timestamp = Date.now();
  const messages = dataList.map(data => ({
    type: 'thumbnail-generation',
    timestamp,
    photoId: data.photoId,
    r2Url: data.r2Url,
    galleryId: data.galleryId,
    filename: data.filename,
    cloudinaryCredentials: {
      cloudName: data.cloudinaryCredentials.cloudName,
      apiKey: data.cloudinaryCredentials.apiKey,
      apiSecret: data.cloudinaryCredentials.apiSecret,
    },
  }));

  return publishToQueueBulk('thumbnail-generation', messages);
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
export async function queuePhotosDeletionForEntities(whereCriteria: Prisma.PhotoWhereInput): Promise<{ success: boolean; error?: string }> {
  if (!isQueueConfigured()) return { success: true }; // No queue configured, consider it success
  
  const photos = await prisma.photo.findMany({
    where: whereCriteria,
    select: {
      id: true,
      r2Key: true,
      thumbnailUrl: true,
      storageAccountId: true,
      fileSize: true,
    }
  });

  if (photos.length === 0) return { success: true }; // No photos to delete

  // Mengumpulkan semua storageAccountId unik dari foto-foto yang akan dihapus
  const uniqueStorageAccountIds = Array.from(new Set(photos.map((p: typeof photos[number]) => p.storageAccountId).filter(Boolean))) as string[];

  // Mengambil semua akun penyimpanan yang relevan dalam satu query
  const storageAccounts = await prisma.storageAccount.findMany({
    where: { id: { in: uniqueStorageAccountIds } }
  });

  // Membuat map dari storageAccountId ke kredensial Cloudinary yang sesuai
  const cloudinaryCredentialsMap = new Map<string, { cloudName: string | null; apiKey: string | null; apiSecret: string | null } | null>();
  
  storageAccounts.forEach((account: typeof storageAccounts[number]) => {
    // We pass the credentials if they exist on the account
    cloudinaryCredentialsMap.set(account.id, {
      cloudName: account.cloudName,
      apiKey: account.apiKey,
      apiSecret: account.apiSecret,
    });
  });

  // Ambil default cloudinary account sebagai fallback jika storage account tidak memilikinya
  const defaultCloudinaryAccount = await prisma.storageAccount.findFirst({
    where: { provider: 'CLOUDINARY', isActive: true },
    orderBy: [{ isDefault: 'desc' }, { priority: 'asc' }],
  });

  const defaultCloudinaryCredentials = defaultCloudinaryAccount ? {
    cloudName: defaultCloudinaryAccount.cloudName,
    apiKey: defaultCloudinaryAccount.apiKey,
    apiSecret: defaultCloudinaryAccount.apiSecret,
  } : null;

  const deletionJobs = photos.map((photo: typeof photos[number]) => {
    // Gunakan kredensial dari map berdasarkan storageAccountId, atau fallback ke default
    let cloudinaryCredentials = defaultCloudinaryCredentials;
    if (photo.storageAccountId && cloudinaryCredentialsMap.has(photo.storageAccountId)) {
      const accountCreds = cloudinaryCredentialsMap.get(photo.storageAccountId);
      // Hanya gunakan jika setidaknya memiliki cloudName dan apiKey
      if (accountCreds && accountCreds.cloudName && accountCreds.apiKey) {
        cloudinaryCredentials = accountCreds;
      }
    }

    return {
      photoId: photo.id,
      r2Key: photo.r2Key,
      thumbnailUrl: photo.thumbnailUrl,
      storageAccountId: photo.storageAccountId,
      fileSize: photo.fileSize?.toString(),
      cloudinaryCredentials,
    };
  }).filter((job: typeof deletionJobs[number]) => job.r2Key || job.thumbnailUrl);

  if (deletionJobs.length > 0) {
    try {
      const result = await queueStorageDeletionBulk(deletionJobs);
      if (result.success) {
        console.log(`[Delete] Queued ${deletionJobs.length} associated photos to Cloudflare Queue`);
        return { success: true };
      } else {
        console.error(`[Delete] Failed to queue ${result.failedCount || 'some'} deletion jobs:`, result.error);
        return { success: false, error: result.error };
      }
    } catch (cfError) {
      logQueueError('Bulk deletion queue error', cfError, {
        photoCount: deletionJobs.length,
      });
      return { success: false, error: cfError instanceof Error ? cfError.message : 'Unknown error' };
    }
  }
  
  return { success: true };
}