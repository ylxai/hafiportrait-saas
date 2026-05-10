'use client';

import { useEffect, useState, useRef } from 'react';
import Ably from 'ably';

// We never expose the root Ably API key to the browser. Instead, the client
// authenticates via `/api/ably/token`, which mints a short-lived TokenRequest
// scoped to the channels the caller is allowed to subscribe to (see
// `src/app/api/ably/token/route.ts`).
//
// We keep one Realtime client per `galleryId` "scope" because the token's
// capability is computed from that scope on the server. Switching scope means
// reconnecting with a different token; mixing them on a single connection
// would leak access between galleries.

type ClientScope = string; // e.g. `gallery:abc123` or `user`

const ablyClients: Map<ClientScope, Ably.Realtime> = new Map();
const scopeListenerCount: Map<ClientScope, number> = new Map();

function buildAuthUrl(galleryId?: string): string {
  if (galleryId) {
    return `/api/ably/token?galleryId=${encodeURIComponent(galleryId)}`;
  }
  return '/api/ably/token';
}

function getScopedClient(scope: ClientScope, galleryId?: string): Ably.Realtime {
  const existing = ablyClients.get(scope);
  if (existing) return existing;

  // `authUrl` causes Ably to fetch a new TokenRequest from our server before
  // every (re)connect, so token expiry is handled automatically.
  const client = new Ably.Realtime({
    authUrl: buildAuthUrl(galleryId),
    authMethod: 'GET',
    // Don't auto-connect during SSR; this hook is `'use client'` but be safe.
    autoConnect: typeof window !== 'undefined',
  });
  ablyClients.set(scope, client);
  return client;
}

function releaseScopedClient(scope: ClientScope) {
  const remaining = (scopeListenerCount.get(scope) ?? 1) - 1;
  if (remaining <= 0) {
    const client = ablyClients.get(scope);
    if (client) {
      client.close();
      ablyClients.delete(scope);
    }
    scopeListenerCount.delete(scope);
  } else {
    scopeListenerCount.set(scope, remaining);
  }
}

function reserveScopedClient(scope: ClientScope) {
  scopeListenerCount.set(scope, (scopeListenerCount.get(scope) ?? 0) + 1);
}

export interface SelectionUpdate {
  photoId: string;
  // 'finalized' is broadcast once when a client submits their selection so
  // other viewers (admin dashboard, second tab) can refresh without polling.
  // For 'finalized', `photoId` is empty and should be ignored by per-photo
  // membership handlers.
  action: 'add' | 'remove' | 'finalized';
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
    if (!galleryId) return;
    const scope = `gallery:${galleryId}`;
    reserveScopedClient(scope);

    const client = getScopedClient(scope, galleryId);
    const channel = client.channels.get(`photostudio:selections:${galleryId}`);

    const handleUpdate = (msg: Ably.Message) => {
      callbackRef.current(msg.data as SelectionUpdate);
    };

    channel.subscribe('selection-update', handleUpdate);
    setIsConnected(true);

    return () => {
      channel.unsubscribe('selection-update', handleUpdate);
      setIsConnected(false);
      releaseScopedClient(scope);
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
    if (!galleryId) return;
    const scope = `gallery:${galleryId}`;
    reserveScopedClient(scope);

    const client = getScopedClient(scope, galleryId);
    const channel = client.channels.get(`photostudio:views:${galleryId}`);

    const handleUpdate = (msg: Ably.Message) => {
      callbackRef.current((msg.data as ViewCountUpdate).count);
    };

    channel.subscribe('view-count', handleUpdate);
    setIsConnected(true);

    return () => {
      channel.unsubscribe('view-count', handleUpdate);
      setIsConnected(false);
      releaseScopedClient(scope);
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
    if (!userId) return;
    const scope = 'user';
    reserveScopedClient(scope);

    const client = getScopedClient(scope);
    const channel = client.channels.get(`photostudio:notifications:${userId}`);

    const handleNotification = (msg: Ably.Message) => {
      callbackRef.current(msg.data as Notification);
    };

    channel.subscribe('notification', handleNotification);
    setIsConnected(true);

    return () => {
      channel.unsubscribe('notification', handleNotification);
      setIsConnected(false);
      releaseScopedClient(scope);
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
    const scope = 'user';
    reserveScopedClient(scope);

    const client = getScopedClient(scope);
    const channel = client.channels.get('photostudio:bookings');

    const handleUpdate = (msg: Ably.Message) => {
      callbackRef.current(msg.data as BookingUpdate);
    };

    channel.subscribe('booking-update', handleUpdate);
    setIsConnected(true);

    return () => {
      channel.unsubscribe('booking-update', handleUpdate);
      setIsConnected(false);
      releaseScopedClient(scope);
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
    const scope = 'user';
    reserveScopedClient(scope);

    const client = getScopedClient(scope);
    const channel = client.channels.get('photostudio:payments');

    const handleUpdate = (msg: Ably.Message) => {
      callbackRef.current(msg.data as PaymentUpdate);
    };

    channel.subscribe('payment-update', handleUpdate);
    setIsConnected(true);

    return () => {
      channel.unsubscribe('payment-update', handleUpdate);
      setIsConnected(false);
      releaseScopedClient(scope);
    };
  }, []);

  return isConnected;
}

/**
 * Reflects the live connection state of any Ably client this hook tree opened.
 *
 * The hook deliberately *does not* open a new Realtime client of its own; it
 * piggy-backs on whichever scoped client another hook already opened. If
 * nothing else is subscribed, the indicator simply stays `false`, which is the
 * accurate state.
 */
export function useAblyConnection() {
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const update = () => {
      let connected = false;
      for (const client of ablyClients.values()) {
        if (client.connection.state === 'connected') {
          connected = true;
          break;
        }
      }
      setIsConnected(connected);
    };

    // Listen on every currently-known client; recompute when any changes state.
    const detachers: Array<() => void> = [];
    for (const client of ablyClients.values()) {
      const onConnected = () => update();
      const onDisconnected = () => update();
      const onClosed = () => update();
      client.connection.on('connected', onConnected);
      client.connection.on('disconnected', onDisconnected);
      client.connection.on('closed', onClosed);
      detachers.push(() => {
        client.connection.off('connected', onConnected);
        client.connection.off('disconnected', onDisconnected);
        client.connection.off('closed', onClosed);
      });
    }

    update();

    return () => {
      for (const detach of detachers) detach();
    };
  }, []);

  return isConnected;
}
