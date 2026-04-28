/**
 * Failed Job Management - Dead Letter Queue
 *
 * Tracks failed queue jobs (thumbnail generation, storage deletion)
 * so they can be retried manually or investigated.
 */

import { prisma } from '@/lib/db';

export type FailedJobType = 'thumbnail-generation' | 'storage-deletion';
export type FailedJobStatus = 'pending' | 'resolved' | 'discarded';

export interface CreateFailedJobParams {
  jobType: FailedJobType;
  payload: Record<string, unknown>;
  errorMessage: string;
}

/**
 * Record a failed job after all retries exhausted
 */
export async function recordFailedJob(params: CreateFailedJobParams): Promise<string> {
  const job = await prisma.failedJob.create({
    data: {
      jobType: params.jobType,
      payload: params.payload as object,
      errorMessage: params.errorMessage,
      attemptCount: 1,
      lastAttemptAt: new Date(),
      status: 'pending',
    },
  });

  console.warn(`[FailedJob] Recorded ${params.jobType} failure: ${params.errorMessage}`);

  // TODO: Send alert to admin via Ably (optional enhancement)

  return job.id;
}

/**
 * Mark a failed job as resolved
 */
export async function resolveFailedJob(jobId: string, resolvedBy: string): Promise<void> {
  await prisma.failedJob.update({
    where: { id: jobId },
    data: {
      status: 'resolved',
      resolvedAt: new Date(),
      resolvedBy,
    },
  });
}

/**
 * Mark a failed job as permanently discarded
 */
export async function discardFailedJob(jobId: string, discardedBy: string): Promise<void> {
  await prisma.failedJob.update({
    where: { id: jobId },
    data: {
      status: 'discarded',
      resolvedAt: new Date(),
      resolvedBy: discardedBy,
    },
  });
}

/**
 * Get pending failed jobs for admin review
 */
export async function getPendingFailedJobs(jobType?: FailedJobType, limit = 50): Promise<Array<{
  id: string;
  jobType: string;
  payload: Record<string, unknown>;
  errorMessage: string;
  attemptCount: number;
  lastAttemptAt: Date;
  createdAt: Date;
}>> {
  return prisma.failedJob.findMany({
    where: {
      status: 'pending',
      ...(jobType && { jobType }),
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  }) as Promise<Array<{
    id: string;
    jobType: string;
    payload: Record<string, unknown>;
    errorMessage: string;
    attemptCount: number;
    lastAttemptAt: Date;
    createdAt: Date;
  }>>;
}

/**
 * Retry a failed thumbnail generation job
 */
export async function retryFailedThumbnailJob(jobId: string): Promise<{ success: boolean; error?: string }> {
  const job = await prisma.failedJob.findUnique({ where: { id: jobId } });

  if (!job) {
    return { success: false, error: 'Job not found' };
  }

  if (job.jobType !== 'thumbnail-generation') {
    return { success: false, error: 'Job is not a thumbnail generation job' };
  }

  if (job.status !== 'pending') {
    return { success: false, error: `Job status is ${job.status}` };
  }

  // Re-queue via cloudflare-queue (this will be called from admin API)
  const { queueThumbnailGeneration } = await import('@/lib/cloudflare-queue');
  const payload = job.payload as {
    photoId: string;
    r2Key: string;
    galleryId: string;
    filename: string;
    cloudinaryCredentials: {
      cloudName: string | null;
      apiKey: string | null;
      apiSecret: string | null;
    };
  };

  const result = await queueThumbnailGeneration({
    photoId: payload.photoId,
    r2Key: payload.r2Key,
    galleryId: payload.galleryId,
    filename: payload.filename,
    cloudinaryCredentials: payload.cloudinaryCredentials,
  });

  if (result.success) {
    // Mark job as resolved since it was successfully re-queued
    await prisma.failedJob.update({
      where: { id: jobId },
      data: {
        status: 'resolved',
        resolvedAt: new Date(),
        resolvedBy: 'system-retry',
      },
    });
  }

  return result;
}

/**
 * Get failed job statistics for admin dashboard
 */
export async function getFailedJobStats(): Promise<{
  pending: number;
  resolved: number;
  discarded: number;
  byType: Record<string, number>;
}> {
  const jobs = await prisma.failedJob.findMany({
    select: {
      status: true,
      jobType: true,
    },
  });

  const stats = {
    pending: 0,
    resolved: 0,
    discarded: 0,
    byType: {} as Record<string, number>,
  };

  for (const job of jobs) {
    if (job.status === 'pending') stats.pending++;
    else if (job.status === 'resolved') stats.resolved++;
    else if (job.status === 'discarded') stats.discarded++;

    stats.byType[job.jobType] = (stats.byType[job.jobType] || 0) + 1;
  }

  return stats;
}
