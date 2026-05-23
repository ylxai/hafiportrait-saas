/**
 * Ably token endpoint.
 *
 * Issues short-lived TokenRequest objects so browsers never see the root
 * `ABLY_API_KEY`. Each token is scoped via `capability` so a client can only
 * subscribe / publish to channels it actually owns:
 *
 *   - Anonymous public viewer (?galleryId=...) → subscribe to selections + view
 *     count for that gallery only.
 *   - Authenticated portal/admin user → subscribe to its own notifications and
 *     listen to global booking/payment streams.
 *   - Admin role → also subscribe to admin alerts.
 *
 * Publish capability is intentionally NOT granted to clients; all server-side
 * state changes go through `src/lib/ably.ts` REST helpers using the root key.
 */

import { NextResponse } from 'next/server';
import Ably from 'ably';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';
import { env } from '@/lib/env';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Capability = Record<string, ('subscribe' | 'publish' | 'presence' | 'history')[]>;

function buildCapability(opts: {
  galleryId?: string;
  userId?: string;
  isAdmin: boolean;
}): Capability {
  const prefix = env.NEXT_PUBLIC_ABLY_CHANNEL_PREFIX;
  const cap: Capability = {};

  if (opts.galleryId) {
    cap[`${prefix}:selections:${opts.galleryId}`] = ['subscribe'];
    cap[`${prefix}:views:${opts.galleryId}`] = ['subscribe'];
    cap[`${prefix}:uploads:${opts.galleryId}`] = ['subscribe'];
  }

  if (opts.userId) {
    cap[`${prefix}:notifications:${opts.userId}`] = ['subscribe'];
  }

  // Booking / payment streams are global but read-only for the client.
  cap[`${prefix}:bookings`] = ['subscribe'];
  cap[`${prefix}:payments`] = ['subscribe'];

  if (opts.isAdmin) {
    cap[`${prefix}:admin:alerts`] = ['subscribe'];
  }

  return cap;
}

export async function GET(request: Request) {
  if (!env.ABLY_API_KEY) {
    return NextResponse.json(
      { error: 'Ably is not configured on this deployment' },
      { status: 503 },
    );
  }

  const url = new URL(request.url);
  const galleryId = url.searchParams.get('galleryId') ?? undefined;

  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  // Prisma stores `role` as a lowercase string (`'admin'` or `'CLIENT'`,
  // matching the rest of this codebase's middleware checks). Compare both
  // casings defensively.
  const isAdmin = session?.user?.role?.toLowerCase() === 'admin';

  const capability = buildCapability({ galleryId, userId, isAdmin });

  // Refuse to issue an empty-capability token — that just wastes connections.
  if (Object.keys(capability).length === 0) {
    return NextResponse.json(
      { error: 'No realtime channels are available for this caller' },
      { status: 403 },
    );
  }

  try {
    const rest = new Ably.Rest(env.ABLY_API_KEY);
    const tokenRequest = await rest.auth.createTokenRequest({
      clientId: userId ?? `viewer-${galleryId ?? 'anon'}`,
      capability: JSON.stringify(capability),
      ttl: 60 * 60 * 1000, // 1 hour
    });

    return NextResponse.json(tokenRequest);
  } catch (error) {
    console.error('[ably/token] Failed to mint token request:', error);
    return NextResponse.json(
      { error: 'Failed to create Ably token request' },
      { status: 500 },
    );
  }
}
