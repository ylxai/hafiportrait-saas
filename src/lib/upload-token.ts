import { createHmac, timingSafeEqual } from 'crypto';
import { env } from '@/lib/env.server';
import { logger } from '@/lib/logger';

/**
 * Shared upload-token helpers.
 *
 * Both the issuer (`/api/public/booking/[kodeBooking]`) and the verifier
 * (`/api/public/payment/presigned`) must use the same derivation scheme.
 * Centralising here prevents drift if the version tag or payload format
 * ever changes — update once, both sides stay in sync.
 *
 * Scheme:
 *   tokenKey  = HMAC-SHA256(VPS_WEBHOOK_SECRET, 'upload-token-v1')
 *   token     = HMAC-SHA256(tokenKey, `${eventId}:${expiry}`)
 *
 * The 'upload-token-v1' tag provides domain separation from the webhook
 * signing path so the same underlying secret cannot be cross-used.
 */

const UPLOAD_TOKEN_TAG = 'upload-token-v1';

/** 24 hours — long enough for a booker to return and upload; short enough to limit replay risk. */
export const UPLOAD_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

function getTokenKey(secret: string): Buffer {
  return createHmac('sha256', secret).update(UPLOAD_TOKEN_TAG).digest();
}

/**
 * Issue a short-lived HMAC upload token for a new booker.
 * Returns `null` when `VPS_WEBHOOK_SECRET` is not configured.
 */
export function deriveUploadToken(
  eventId: string,
  expiry: number,
): string | null {
  if (!env.VPS_WEBHOOK_SECRET) return null;
  const tokenKey = getTokenKey(env.VPS_WEBHOOK_SECRET);
  return createHmac('sha256', tokenKey)
    .update(`${eventId}:${expiry}`)
    .digest('hex');
}

export type VerifyResult =
  | { valid: true }
  | { valid: false; reason: string };

/**
 * Verify an upload token issued by `deriveUploadToken`.
 * Uses timing-safe comparison to prevent timing attacks.
 */
export function verifyUploadToken(
  token: string,
  eventId: string,
  expiry: number,
): VerifyResult {
  if (!env.VPS_WEBHOOK_SECRET) {
    logger.warn('upload_token.verify.no_secret', { eventId });
    return { valid: false, reason: 'Upload token signing not configured' };
  }

  if (Date.now() > expiry) {
    return { valid: false, reason: 'Upload token expired' };
  }

  const expected = deriveUploadToken(eventId, expiry);
  if (!expected) {
    return { valid: false, reason: 'Upload token signing not configured' };
  }

  try {
    const tokenBuf = Buffer.from(token, 'hex');
    const expectedBuf = Buffer.from(expected, 'hex');
    if (tokenBuf.length !== expectedBuf.length) {
      return { valid: false, reason: 'Invalid upload token' };
    }
    const match = timingSafeEqual(tokenBuf, expectedBuf);
    return match ? { valid: true } : { valid: false, reason: 'Invalid upload token' };
  } catch {
    return { valid: false, reason: 'Invalid upload token' };
  }
}
