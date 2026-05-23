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

// Shape published by `/api/admin/upload/complete` after a photo finishes
// uploading. Only the discriminator fields the subscriber needs to refresh
// its grid are forwarded — the full photo row (url/width/height/etc.) is
// fetched separately from `/api/public/gallery/[token]` via SWR.
export interface PhotoUploadedEvent {
  photoId: string;
  filename: string;
  thumbnailUrl?: string | null;
}

// Shape published by `/api/admin/upload/presigned` when a client crosses
// a quota threshold and by `src/lib/failed-jobs.ts` when a background job
// crosses an alert threshold. Kept as a discriminated union via the
// `type` tag so a single subscriber can dispatch on it without inspecting
// channel/event names.
export type AdminAlert =
  | {
      type: 'storage_quota';
      clientId: string;
      clientName: string;
      galleryId: string;
      alertType: 'warning' | 'critical' | 'exceeded';
      usedGB: number;
      quotaGB: number;
      percentage: number;
      userId?: string;
      timestamp: string;
    }
  | {
      type: 'failed_job';
      jobId: string;
      jobType: string;
      alertType: 'failed' | 'retry' | 'resolved';
      errorMessage?: string;
      attemptCount?: number;
      resolvedBy?: string;
      timestamp: string;
    };

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
 * Subscribes the public gallery viewer to `photo-uploaded` broadcasts so
 * newly uploaded photos appear without a manual refresh.
 *
 * The Ably payload is intentionally small (`photoId / filename /
 * thumbnailUrl?`); the rich Photo row (url, dimensions, lightbox URL) is
 * derived server-side in `loadPublicGallery`, so callers should treat this
 * hook as a refresh signal and re-read the API rather than rendering from
 * the event payload directly.
 *
 * The channel is reused with the same `gallery:{id}` scope as the existing
 * selection / view-count subscribers, so all three share a single Ably
 * Realtime connection per gallery.
 */
export function usePhotoUploadSubscription(
  galleryId: string,
  onUpload: (event: PhotoUploadedEvent) => void,
) {
  const [isConnected, setIsConnected] = useState(false);
  const callbackRef = useRef(onUpload);

  useEffect(() => {
    callbackRef.current = onUpload;
  }, [onUpload]);

  useEffect(() => {
    if (!galleryId) return;
    const scope = `gallery:${galleryId}`;
    reserveScopedClient(scope);

    const client = getScopedClient(scope, galleryId);
    const channel = client.channels.get(`photostudio:uploads:${galleryId}`);

    const handleUpload = (msg: Ably.Message) => {
      callbackRef.current(msg.data as PhotoUploadedEvent);
    };

    channel.subscribe('photo-uploaded', handleUpload);
    setIsConnected(true);

    return () => {
      channel.unsubscribe('photo-uploaded', handleUpload);
      setIsConnected(false);
      releaseScopedClient(scope);
    };
  }, [galleryId]);

  return isConnected;
}

/**
 * Subscribes the admin dashboard to the global `admin:alerts` channel for
 * proactive warnings (storage quota crossings, failed background jobs).
 *
 * `enabled` lets callers gate the subscription on session presence and the
 * admin role — when `false` the hook is a no-op so non-admins do not even
 * attempt to mint a TokenRequest (the server-side `/api/ably/token` route
 * would 403 them anyway, but suppressing the request avoids the noise).
 *
 * Both `storage-quota-alert` and `failed-job-alert` events are handed to the
 * same callback as a discriminated `AdminAlert` union; callers dispatch on
 * `alert.type`.
 */
export function useAdminAlertsSubscription(
  enabled: boolean,
  onAlert: (alert: AdminAlert) => void,
) {
  const [isConnected, setIsConnected] = useState(false);
  const callbackRef = useRef(onAlert);

  useEffect(() => {
    callbackRef.current = onAlert;
  }, [onAlert]);

  useEffect(() => {
    if (!enabled) return;
    // Dedicated scope so the admin-alerts socket is not co-mingled with
    // gallery-viewer connections; closing one client should not interrupt
    // the other.
    const scope = 'admin';
    reserveScopedClient(scope);

    const client = getScopedClient(scope);
    const channel = client.channels.get('photostudio:admin:alerts');

    const handleQuota = (msg: Ably.Message) => {
      callbackRef.current(msg.data as AdminAlert);
    };
    const handleFailedJob = (msg: Ably.Message) => {
      callbackRef.current(msg.data as AdminAlert);
    };

    channel.subscribe('storage-quota-alert', handleQuota);
    channel.subscribe('failed-job-alert', handleFailedJob);
    setIsConnected(true);

    return () => {
      channel.unsubscribe('storage-quota-alert', handleQuota);
      channel.unsubscribe('failed-job-alert', handleFailedJob);
      setIsConnected(false);
      releaseScopedClient(scope);
    };
  }, [enabled]);

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
