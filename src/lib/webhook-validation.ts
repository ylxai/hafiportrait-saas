import { createHmac, timingSafeEqual } from 'crypto';
import { logger } from '@/lib/logger';

/**
 * Webhook Validation Utilities
 * 
 * Provides security features for webhook endpoints:
 * - HMAC signature verification
 * - Timestamp validation (prevent replay attacks)
 * - IP whitelist support
 */

const WEBHOOK_SECRET = process.env.VPS_WEBHOOK_SECRET;
const REPLAY_ATTACK_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

export interface WebhookValidationResult {
  valid: boolean;
  error?: string;
  errorCode?: 'MISSING_SECRET' | 'MISSING_SIGNATURE' | 'INVALID_SIGNATURE' | 'MISSING_TIMESTAMP' | 'INVALID_TIMESTAMP' | 'REPLAY_ATTACK' | 'IP_NOT_WHITELISTED';
}

/**
 * Verify webhook signature using HMAC-SHA256
 * 
 * @param payload - Raw request body as string
 * @param signature - Signature from x-webhook-signature header
 * @param timestamp - Timestamp from x-webhook-timestamp header
 * @param secret - Webhook secret (defaults to VPS_WEBHOOK_SECRET env var)
 * @returns Validation result
 * 
 * @example
 * const body = await request.text();
 * const signature = request.headers.get('x-webhook-signature');
 * const timestamp = request.headers.get('x-webhook-timestamp');
 * const result = verifyWebhookSignature(body, signature, timestamp);
 * if (!result.valid) {
 *   return errorResponse(result.error, 401);
 * }
 */
export function verifyWebhookSignature(
  payload: string,
  signature: string | null,
  timestamp: string | null,
  secret: string = WEBHOOK_SECRET || ''
): WebhookValidationResult {
  // Check if secret is configured
  if (!secret) {
    logger.error('webhook.secret_not_configured', {});
    return {
      valid: false,
      error: 'Webhook secret not configured',
      errorCode: 'MISSING_SECRET',
    };
  }

  // Check if signature is provided
  if (!signature) {
    return {
      valid: false,
      error: 'Missing webhook signature',
      errorCode: 'MISSING_SIGNATURE',
    };
  }

  // Check if timestamp is provided
  if (!timestamp) {
    return {
      valid: false,
      error: 'Missing webhook timestamp',
      errorCode: 'MISSING_TIMESTAMP',
    };
  }

  // Validate timestamp format (supports ISO 8601 and Unix timestamps in seconds or ms)
  const numericTimestamp = Number(timestamp);
  const timestampMs = Number.isFinite(numericTimestamp)
    ? (numericTimestamp < 1e12 ? numericTimestamp * 1000 : numericTimestamp)
    : Date.parse(timestamp);

  if (Number.isNaN(timestampMs)) {
    return {
      valid: false,
      error: 'Invalid timestamp format',
      errorCode: 'INVALID_TIMESTAMP',
    };
  }

  // Check for replay attacks (timestamp too old)
  const now = Date.now();
  const age = now - timestampMs;
  
  if (age > REPLAY_ATTACK_WINDOW_MS) {
    logger.warn('webhook.replay_attack_detected', { ageMs: age });
    return {
      valid: false,
      error: 'Webhook timestamp too old (possible replay attack)',
      errorCode: 'REPLAY_ATTACK',
    };
  }

  // Prevent future timestamps (clock skew tolerance: 1 minute)
  if (age < -60000) {
    return {
      valid: false,
      error: 'Webhook timestamp is in the future',
      errorCode: 'INVALID_TIMESTAMP',
    };
  }

  // Compute expected signature: HMAC-SHA256(secret, timestamp + payload)
  const message = timestamp + payload;
  const expectedSignature = createHmac('sha256', secret)
    .update(message)
    .digest('hex');

  // Timing-safe comparison to prevent timing attacks
  try {
    const signatureBuffer = Buffer.from(signature, 'hex');
    const expectedBuffer = Buffer.from(expectedSignature, 'hex');
    
    if (signatureBuffer.length !== expectedBuffer.length) {
      return {
        valid: false,
        error: 'Invalid webhook signature',
        errorCode: 'INVALID_SIGNATURE',
      };
    }
    
    const isValid = timingSafeEqual(signatureBuffer, expectedBuffer);
    
    if (!isValid) {
      logger.warn('webhook.invalid_signature', {});
      return {
        valid: false,
        error: 'Invalid webhook signature',
        errorCode: 'INVALID_SIGNATURE',
      };
    }
    
    return { valid: true };
  } catch (error) {
    logger.error('webhook.signature_verification_error', { err: error });
    return {
      valid: false,
      error: 'Signature verification failed',
      errorCode: 'INVALID_SIGNATURE',
    };
  }
}
