'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import Ably from 'ably';
import { env } from '@/lib/env';

let ablyClient: Ably.Realtime | null = null;
let connectionListeners = 0;

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
  const callbackRef = useRef(onUpdate);

  // Keep callback ref up to date
  useEffect(() => {
    callbackRef.current = onUpdate;
  }, [onUpdate]);

  useEffect(() => {
    if (!galleryId || !env.NEXT_PUBLIC_ABLY_API_KEY) return;

    const client = getClient();
    const channel = client.channels.get(`photostudio:selections:${galleryId}`);
    
    const handleUpdate = (msg: Ably.Message) => {
      callbackRef.current(msg.data as SelectionUpdate);
    };

    channel.subscribe('selection-update', handleUpdate);
    setIsConnected(true);

    return () => {
      channel.unsubscribe('selection-update', handleUpdate);
      setIsConnected(false);
    };
  }, [galleryId]);

  return isConnected;
}

export function useViewCountSubscription(galleryId: string, onUpdate: (count: number) => void) {
  const [isConnected, setIsConnected] = useState(false);
  const callbackRef = useRef(onUpdate);

  useEffect(() => {
    callbackRef.current = onUpdate;
  }, [onUpdate]);

  useEffect(() => {
    if (!galleryId || !env.NEXT_PUBLIC_ABLY_API_KEY) return;

    const client = getClient();
    const channel = client.channels.get(`photostudio:views:${galleryId}`);
    
    const handleUpdate = (msg: Ably.Message) => {
      callbackRef.current((msg.data as ViewCountUpdate).count);
    };

    channel.subscribe('view-count', handleUpdate);
    setIsConnected(true);

    return () => {
      channel.unsubscribe('view-count', handleUpdate);
      setIsConnected(false);
    };
  }, [galleryId]);

  return isConnected;
}

export function useNotificationSubscription(userId: string, onNotification: (notification: Notification) => void) {
  const [isConnected, setIsConnected] = useState(false);
  const callbackRef = useRef(onNotification);

  useEffect(() => {
    callbackRef.current = onNotification;
  }, [onNotification]);

  useEffect(() => {
    if (!userId || !env.NEXT_PUBLIC_ABLY_API_KEY) return;

    const client = getClient();
    const channel = client.channels.get(`photostudio:notifications:${userId}`);
    
    const handleNotification = (msg: Ably.Message) => {
      callbackRef.current(msg.data as Notification);
    };

    channel.subscribe('notification', handleNotification);
    setIsConnected(true);

    return () => {
      channel.unsubscribe('notification', handleNotification);
      setIsConnected(false);
    };
  }, [userId]);

  return isConnected;
}

export function useBookingUpdates(onUpdate: (update: BookingUpdate) => void) {
  const [isConnected, setIsConnected] = useState(false);
  const callbackRef = useRef(onUpdate);

  useEffect(() => {
    callbackRef.current = onUpdate;
  }, [onUpdate]);

  useEffect(() => {
    if (!env.NEXT_PUBLIC_ABLY_API_KEY) return;

    const client = getClient();
    const channel = client.channels.get('photostudio:bookings');
    
    const handleUpdate = (msg: Ably.Message) => {
      callbackRef.current(msg.data as BookingUpdate);
    };

    channel.subscribe('booking-update', handleUpdate);
    setIsConnected(true);

    return () => {
      channel.unsubscribe('booking-update', handleUpdate);
      setIsConnected(false);
    };
  }, []);

  return isConnected;
}

export function usePaymentUpdates(onUpdate: (update: PaymentUpdate) => void) {
  const [isConnected, setIsConnected] = useState(false);
  const callbackRef = useRef(onUpdate);

  useEffect(() => {
    callbackRef.current = onUpdate;
  }, [onUpdate]);

  useEffect(() => {
    if (!env.NEXT_PUBLIC_ABLY_API_KEY) return;

    const client = getClient();
    const channel = client.channels.get('photostudio:payments');
    
    const handleUpdate = (msg: Ably.Message) => {
      callbackRef.current(msg.data as PaymentUpdate);
    };

    channel.subscribe('payment-update', handleUpdate);
    setIsConnected(true);

    return () => {
      channel.unsubscribe('payment-update', handleUpdate);
      setIsConnected(false);
    };
  }, []);

  return isConnected;
}

export function useAblyConnection() {
  const [isConnected, setIsConnected] = useState(false);
  const listenersRef = useRef<{ 
    onConnected: () => void; 
    onDisconnected: () => void; 
    onClosed: () => void;
  } | null>(null);

  useEffect(() => {
    if (!env.NEXT_PUBLIC_ABLY_API_KEY) return;

    const client = getClient();
    
    // Create stable handler references
    listenersRef.current = {
      onConnected: () => setIsConnected(true),
      onDisconnected: () => setIsConnected(false),
      onClosed: () => setIsConnected(false),
    };

    // Use Ably's listener API with proper typing
    client.connection.on('connected', listenersRef.current.onConnected);
    client.connection.on('disconnected', listenersRef.current.onDisconnected);
    client.connection.on('closed', listenersRef.current.onClosed);

    // Set initial state
    setIsConnected(client.connection.state === 'connected');

    connectionListeners++;

    return () => {
      if (listenersRef.current) {
        client.connection.off('connected', listenersRef.current.onConnected);
        client.connection.off('disconnected', listenersRef.current.onDisconnected);
        client.connection.off('closed', listenersRef.current.onClosed);
      }
      connectionListeners--;
      
      // Close client if no more listeners (optional cleanup)
      if (connectionListeners === 0 && ablyClient) {
        ablyClient.close();
        ablyClient = null;
      }
    };
  }, []);

  return isConnected;
}
