import { createHmac, timingSafeEqual } from 'crypto';

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
    console.error('[Webhook] VPS_WEBHOOK_SECRET not configured');
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

  // Validate timestamp format (should be ISO 8601 or Unix timestamp)
  const timestampMs = Date.parse(timestamp);
  if (isNaN(timestampMs)) {
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
    console.warn(`[Webhook] Replay attack detected: timestamp ${age}ms old`);
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
      console.warn('[Webhook] Invalid signature detected');
      return {
        valid: false,
        error: 'Invalid webhook signature',
        errorCode: 'INVALID_SIGNATURE',
      };
    }
    
    return { valid: true };
  } catch (error) {
    console.error('[Webhook] Signature verification error:', error);
    return {
      valid: false,
      error: 'Signature verification failed',
      errorCode: 'INVALID_SIGNATURE',
    };
  }
}

/**
 * Verify IP address against whitelist
 * 
 * @param ip - Client IP address
 * @param whitelist - Array of allowed IP addresses or CIDR ranges
 * @returns Validation result
 * 
 * @example
 * const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';
 * const result = verifyWebhookIP(ip, ['203.0.113.0/24', '198.51.100.42']);
 * if (!result.valid) {
 *   return errorResponse(result.error, 403);
 * }
 */
export function verifyWebhookIP(
  ip: string,
  whitelist: string[]
): WebhookValidationResult {
  if (whitelist.length === 0) {
    // No whitelist configured, allow all
    return { valid: true };
  }

  // Simple IP matching (exact match or CIDR prefix)
  // For production, consider using a library like 'ip-range-check'
  const isWhitelisted = whitelist.some(allowed => {
    if (allowed.includes('/')) {
      // CIDR range - simple prefix match (not full CIDR validation)
      const [network] = allowed.split('/');
      return ip.startsWith(network.split('.').slice(0, -1).join('.'));
    }
    return ip === allowed;
  });

  if (!isWhitelisted) {
    console.warn(`[Webhook] IP not whitelisted: ${ip}`);
    return {
      valid: false,
      error: 'IP address not whitelisted',
      errorCode: 'IP_NOT_WHITELISTED',
    };
  }

  return { valid: true };
}

/**
 * Generate webhook signature for testing
 * 
 * @param payload - Request body as string
 * @param timestamp - ISO 8601 timestamp
 * @param secret - Webhook secret
 * @returns HMAC-SHA256 signature as hex string
 * 
 * @example
 * const payload = JSON.stringify({ event: 'test' });
 * const timestamp = new Date().toISOString();
 * const signature = generateWebhookSignature(payload, timestamp, 'secret');
 * // Use in test request headers:
 * // x-webhook-signature: signature
 * // x-webhook-timestamp: timestamp
 */
export function generateWebhookSignature(
  payload: string,
  timestamp: string,
  secret: string
): string {
  const message = timestamp + payload;
  return createHmac('sha256', secret)
    .update(message)
    .digest('hex');
}
