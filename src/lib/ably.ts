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
