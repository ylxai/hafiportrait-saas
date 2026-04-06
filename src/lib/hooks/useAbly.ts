'use client';

import { useEffect, useState, useCallback } from 'react';
import Ably from 'ably';
import { env } from '@/lib/env';

let ablyClient: Ably.Realtime | null = null;

function getClient(): Ably.Realtime {
  if (!ablyClient) {
    const key = env.NEXT_PUBLIC_ABLY_API_KEY;
    if (!key) {
      throw new Error('NEXT_PUBLIC_ABLY_API_KEY is not configured');
    }
    ablyClient = new Ably.Realtime(key);
  }
  return ablyClient;
}

export interface SelectionUpdate {
  photoId: string;
  action: 'add' | 'remove';
  selectionCount: number;
  clientToken: string;
}

export interface ViewCountUpdate {
  count: number;
  galleryId: string;
}

export interface Notification {
  type: 'booking' | 'payment' | 'selection' | 'gallery';
  title: string;
  message: string;
  data?: Record<string, unknown>;
}

export interface BookingUpdate {
  eventId: string;
  action: 'created' | 'updated' | 'status_changed';
  booking: Record<string, unknown>;
}

export interface PaymentUpdate {
  eventId: string;
  action: 'created' | 'updated' | 'paid';
  amount: number;
}

export function useSelectionSubscription(galleryId: string, onUpdate: (update: SelectionUpdate) => void) {
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (!galleryId || !env.NEXT_PUBLIC_ABLY_API_KEY) return;

    const channel = getClient().channels.get(`photostudio:selections:${galleryId}`);
    
    const handleUpdate = (msg: Ably.Message) => {
      onUpdate(msg.data as SelectionUpdate);
    };

    channel.subscribe('selection-update', handleUpdate);
    setIsConnected(true);

    return () => {
      channel.unsubscribe('selection-update', handleUpdate);
    };
  }, [galleryId, onUpdate]);

  return isConnected;
}

export function useViewCountSubscription(galleryId: string, onUpdate: (count: number) => void) {
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (!galleryId || !env.NEXT_PUBLIC_ABLY_API_KEY) return;

    const channel = getClient().channels.get(`photostudio:views:${galleryId}`);
    
    const handleUpdate = (msg: Ably.Message) => {
      onUpdate((msg.data as ViewCountUpdate).count);
    };

    channel.subscribe('view-count', handleUpdate);
    setIsConnected(true);

    return () => {
      channel.unsubscribe('view-count', handleUpdate);
    };
  }, [galleryId, onUpdate]);

  return isConnected;
}

export function useNotificationSubscription(userId: string, onNotification: (notification: Notification) => void) {
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (!userId || !env.NEXT_PUBLIC_ABLY_API_KEY) return;

    const channel = getClient().channels.get(`photostudio:notifications:${userId}`);
    
    const handleNotification = (msg: Ably.Message) => {
      onNotification(msg.data as Notification);
    };

    channel.subscribe('notification', handleNotification);
    setIsConnected(true);

    return () => {
      channel.unsubscribe('notification', handleNotification);
    };
  }, [userId, onNotification]);

  return isConnected;
}

export function useBookingUpdates(onUpdate: (update: BookingUpdate) => void) {
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (!env.NEXT_PUBLIC_ABLY_API_KEY) return;

    const channel = getClient().channels.get('photostudio:bookings');
    
    const handleUpdate = (msg: Ably.Message) => {
      onUpdate(msg.data as BookingUpdate);
    };

    channel.subscribe('booking-update', handleUpdate);
    setIsConnected(true);

    return () => {
      channel.unsubscribe('booking-update', handleUpdate);
    };
  }, [onUpdate]);

  return isConnected;
}

export function usePaymentUpdates(onUpdate: (update: PaymentUpdate) => void) {
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (!env.NEXT_PUBLIC_ABLY_API_KEY) return;

    const channel = getClient().channels.get('photostudio:payments');
    
    const handleUpdate = (msg: Ably.Message) => {
      onUpdate(msg.data as PaymentUpdate);
    };

    channel.subscribe('payment-update', handleUpdate);
    setIsConnected(true);

    return () => {
      channel.unsubscribe('payment-update', handleUpdate);
    };
  }, [onUpdate]);

  return isConnected;
}

export function useAblyConnection() {
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (!env.NEXT_PUBLIC_ABLY_API_KEY) return;

    const client = getClient();
    
    client.connection.on('connected' as any, () => setIsConnected(true));
    client.connection.on('disconnected' as any, () => setIsConnected(false));
    client.connection.on('closed' as any, () => setIsConnected(false));

    return () => {
      client.connection.off('connected' as any);
      client.connection.off('disconnected' as any);
      client.connection.off('closed' as any);
    };
  }, []);

  return isConnected;
}
