import Ably from 'ably';
import { env } from './env';

let ablyClient: Ably.Realtime | null = null;

export function getAblyClient(): Ably.Realtime {
  if (!ablyClient) {
    if (!env.ABLY_API_KEY) {
      throw new Error('ABLY_API_KEY is not configured');
    }
    ablyClient = new Ably.Realtime(env.ABLY_API_KEY);
  }
  return ablyClient;
}

export function getAblyRestClient(): Ably.Rest {
  if (!env.ABLY_API_KEY) {
    throw new Error('ABLY_API_KEY is not configured');
  }
  return new Ably.Rest(env.ABLY_API_KEY);
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
  action: 'add' | 'remove';
  selectionCount: number;
  clientToken: string;
}) {
  try {
    const client = getAblyRestClient();
    await client.channels.get(CHANNELS.SELECTIONS(galleryId)).publish('selection-update', data);
  } catch (error) {
    console.error('Failed to publish selection update:', error);
  }
}

export async function publishViewCount(galleryId: string, count: number) {
  try {
    const client = getAblyRestClient();
    await client.channels.get(CHANNELS.VIEW_COUNT(galleryId)).publish('view-count', { count, galleryId });
  } catch (error) {
    console.error('Failed to publish view count:', error);
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
    console.error('Failed to publish notification:', error);
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
    console.error('Failed to publish booking update:', error);
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
    console.error('Failed to publish payment update:', error);
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
    console.error('Failed to publish photo upload:', error);
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
    console.error('Failed to publish photo thumbnail generated:', error);
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
    console.error('Failed to publish storage quota alert:', error);
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
    console.error('Failed to publish failed job alert:', error);
  }
}
