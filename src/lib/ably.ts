import Ably from 'ably';
import { env } from './env.server';
import { logger } from './logger';

let ablyClient: Ably.Realtime | null = null;
let ablyRestClient: Ably.Rest | null = null;

export function getAblyClient(): Ably.Realtime {
  if (!ablyClient) {
    if (!env.ABLY_API_KEY) {
      throw new Error('ABLY_API_KEY is not configured');
    }
    ablyClient = new Ably.Realtime(env.ABLY_API_KEY);
  }
  return ablyClient;
}

/**
 * Singleton Ably REST client.
 *
 * Sprint 2 Task 2.6: previously each call to `getAblyRestClient`
 * spun up a fresh `Ably.Rest` instance. Each instance opens its own
 * keep-alive HTTP agent and re-runs auth setup, so high-traffic
 * publish paths (selection updates, view counts, thumbnail
 * generation) were paying that cost on every invocation. Cache the
 * instance the same way `getAblyClient` does.
 */
export function getAblyRestClient(): Ably.Rest {
  if (!ablyRestClient) {
    if (!env.ABLY_API_KEY) {
      throw new Error('ABLY_API_KEY is not configured');
    }
    ablyRestClient = new Ably.Rest(env.ABLY_API_KEY);
  }
  return ablyRestClient;
}

export const CHANNELS = {
  SELECTIONS: (galleryId: string) => `${env.NEXT_PUBLIC_ABLY_CHANNEL_PREFIX}:selections:${galleryId}`,
  NOTIFICATIONS: (userId: string) => `${env.NEXT_PUBLIC_ABLY_CHANNEL_PREFIX}:notifications:${userId}`,
  VIEW_COUNT: (galleryId: string) => `${env.NEXT_PUBLIC_ABLY_CHANNEL_PREFIX}:views:${galleryId}`,
  BOOKINGS: `${env.NEXT_PUBLIC_ABLY_CHANNEL_PREFIX}:bookings`,
  PAYMENTS: `${env.NEXT_PUBLIC_ABLY_CHANNEL_PREFIX}:payments`,
  UPLOADS: (galleryId: string) => `${env.NEXT_PUBLIC_ABLY_CHANNEL_PREFIX}:uploads:${galleryId}`,
  ADMIN_ALERTS: `${env.NEXT_PUBLIC_ABLY_CHANNEL_PREFIX}:admin:alerts`,
};

export async function publishSelectionUpdate(galleryId: string, data: {
  photoId: string;
  action: 'add' | 'remove' | 'finalized';
  selectionCount: number;
  clientToken: string;
}) {
  try {
    const client = getAblyRestClient();
    await client.channels.get(CHANNELS.SELECTIONS(galleryId)).publish('selection-update', data);
  } catch (error) {
    logger.error('ably.selection_update.publish_failed', { galleryId, err: error });
  }
}

export async function publishViewCount(galleryId: string, count: number) {
  try {
    const client = getAblyRestClient();
    await client.channels.get(CHANNELS.VIEW_COUNT(galleryId)).publish('view-count', { count, galleryId });
  } catch (error) {
    logger.error('ably.view_count.publish_failed', { galleryId, err: error });
  }
}

export async function publishNotification(userId: string, data: {
  type: 'booking' | 'payment' | 'selection' | 'gallery';
  title: string;
  message: string;
  data?: Record<string, unknown>;
}) {
  try {
    const client = getAblyRestClient();
    await client.channels.get(CHANNELS.NOTIFICATIONS(userId)).publish('notification', data);
  } catch (error) {
    logger.error('ably.notification.publish_failed', { userId, err: error });
  }
}

export async function publishBookingUpdate(data: {
  eventId: string;
  action: 'created' | 'updated' | 'status_changed';
  booking: Record<string, unknown>;
}) {
  try {
    const client = getAblyRestClient();
    await client.channels.get(CHANNELS.BOOKINGS).publish('booking-update', data);
  } catch (error) {
    logger.error('ably.booking_update.publish_failed', { eventId: data.eventId, err: error });
  }
}

export async function publishPaymentUpdate(data: {
  eventId: string;
  action: 'created' | 'updated' | 'paid';
  amount: number;
}) {
  try {
    const client = getAblyRestClient();
    await client.channels.get(CHANNELS.PAYMENTS).publish('payment-update', data);
  } catch (error) {
    logger.error('ably.payment_update.publish_failed', { eventId: data.eventId, err: error });
  }
}

export async function publishPhotoUploaded(galleryId: string, data: {
  photoId: string;
  filename: string;
  thumbnailUrl?: string | null;
}) {
  try {
    const client = getAblyRestClient();
    await client.channels.get(CHANNELS.UPLOADS(galleryId)).publish('photo-uploaded', data);
  } catch (error) {
    logger.error('ably.photo_uploaded.publish_failed', { galleryId, err: error });
  }
}

/**
 * Publish photo thumbnail generated event (for real-time dashboard update)
 */
export async function publishPhotoThumbnailGenerated(galleryId: string, data: {
  photoId: string;
  thumbnailUrl: string;
  filename: string;
}) {
  try {
    const client = getAblyRestClient();
    await client.channels.get(CHANNELS.UPLOADS(galleryId)).publish('photo-thumbnail-generated', data);
  } catch (error) {
    logger.error('ably.photo_thumbnail_generated.publish_failed', { galleryId, err: error });
  }
}

export type QuotaAlertType = 'warning' | 'critical' | 'exceeded';

/**
 * Publish storage quota alert for admin dashboard
 */
export async function publishStorageQuotaAlert(data: {
  clientId: string;
  clientName: string;
  galleryId: string;
  alertType: QuotaAlertType;
  usedGB: number;
  quotaGB: number;
  percentage: number;
  userId?: string;
}) {
  try {
    const client = getAblyRestClient();
    await client.channels.get(CHANNELS.ADMIN_ALERTS).publish('storage-quota-alert', {
      type: 'storage_quota',
      ...data,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('ably.storage_quota_alert.publish_failed', {
      clientId: data.clientId,
      err: error,
    });
  }
}

export type FailedJobAlertType = 'failed' | 'retry' | 'resolved';

/**
 * Publish failed job alert for admin dashboard
 */
export async function publishFailedJobAlert(data: {
  jobId: string;
  jobType: string;
  alertType: FailedJobAlertType;
  errorMessage?: string;
  attemptCount?: number;
  resolvedBy?: string;
}) {
  try {
    const client = getAblyRestClient();
    await client.channels.get(CHANNELS.ADMIN_ALERTS).publish('failed-job-alert', {
      type: 'failed_job',
      ...data,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('ably.failed_job_alert.publish_failed', { jobId: data.jobId, err: error });
  }
}
