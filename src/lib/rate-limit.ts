import { redisCache } from './cache';
import { logger } from './logger';

export interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
}

/**
 * Test-only override for the rate-limit window. When `RATE_LIMIT_WINDOW_OVERRIDE_MS`
 * is set on the server (e.g. in CI for the `01-rate-limiting` E2E spec), every
 * rate-limit check uses the override instead of the per-config `windowMs`. This
 * lets the "rate limit resets after window expires" scenario run in a few
 * seconds instead of the full 60s window — which previously forced a
 * `waitForTimeout(61000)` (forbidden by AGENTS.md) or a `test.skip`.
 *
 * The override is intentionally inert in production: the env var is read once
 * at module load and any non-positive / unset value resolves to `null`.
 */
const WINDOW_OVERRIDE_MS: number | null = (() => {
  const raw = process.env.RATE_LIMIT_WINDOW_OVERRIDE_MS;
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
})();

function effectiveWindowMs(config: RateLimitConfig): number {
  return WINDOW_OVERRIDE_MS ?? config.windowMs;
}

/**
 * Redis/Valkey-based rate limiter with fallback to in-memory
 * Persistent across server restarts and multi-instance deployments
 * 
 * Bypass logic:
 * - Vercel preview deployments (VERCEL_ENV=preview): rate limiting disabled for testing
 * - Emergency override (DISABLE_RATE_LIMIT=true): manual bypass for production incidents
 */
export async function checkRateLimit(
  identifier: string,
  config: RateLimitConfig
): Promise<{ success: boolean; remaining: number; resetAt: number }> {
  // 1. Bypass in Vercel preview deployments (development/testing)
  if (process.env.VERCEL_ENV === 'preview') {
    return {
      success: true,
      remaining: config.maxRequests,
      resetAt: Date.now() + config.windowMs,
    };
  }

  // 2. Emergency bypass (production only, requires manual env var)
  if (process.env.DISABLE_RATE_LIMIT === 'true') {
    logger.warn('rate_limit.bypass', {
      reason: 'DISABLE_RATE_LIMIT=true',
      vercel_env: process.env.VERCEL_ENV,
      identifier,
    });
    return {
      success: true,
      remaining: config.maxRequests,
      resetAt: Date.now() + config.windowMs,
    };
  }

  const key = `rate-limit:${identifier}`;
  const now = Date.now();
  const windowMs = effectiveWindowMs(config);
  const windowSeconds = Math.ceil(windowMs / 1000);

  try {
    if (redisCache) {
      // Use Redis/Valkey for distributed rate limiting
      const count = await redisCache.incr(key);
      
      // Set expiry on first request
      if (count === 1) {
        await redisCache.expire(key, windowSeconds);
      }

      // Get TTL for resetAt
      const ttl = await redisCache.ttl(key);
      const resetAt = ttl > 0 ? now + (ttl * 1000) : now + windowMs;

      if (count > config.maxRequests) {
        return {
          success: false,
          remaining: 0,
          resetAt,
        };
      }

      return {
        success: true,
        remaining: Math.max(0, config.maxRequests - count),
        resetAt,
      };
    }
  } catch (error) {
    console.error('[RateLimit] Redis error, falling back to in-memory:', error);
  }

  // Fallback to in-memory if Redis unavailable
  return checkRateLimitMemory(identifier, config);
}

// In-memory fallback (same as before)
interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const memoryStore = new Map<string, RateLimitEntry>();

// Cleanup old entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of memoryStore.entries()) {
    if (entry.resetAt < now) {
      memoryStore.delete(key);
    }
  }
}, 5 * 60 * 1000);

function checkRateLimitMemory(
  identifier: string,
  config: RateLimitConfig
): { success: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const key = identifier;
  
  let entry = memoryStore.get(key);
  
  // Reset if window expired
  if (!entry || entry.resetAt < now) {
    entry = {
      count: 0,
      resetAt: now + effectiveWindowMs(config),
    };
    memoryStore.set(key, entry);
  }
  
  // Check limit
  if (entry.count >= config.maxRequests) {
    return {
      success: false,
      remaining: 0,
      resetAt: entry.resetAt,
    };
  }
  
  // Increment counter
  entry.count++;
  
  return {
    success: true,
    remaining: config.maxRequests - entry.count,
    resetAt: entry.resetAt,
  };
}

// Preset configurations
export const RATE_LIMITS = {
  SEARCH: { maxRequests: 30, windowMs: 60 * 1000 }, // 30 req/min
  EXPORT: { maxRequests: 10, windowMs: 60 * 1000 }, // 10 req/min
  BULK_DELETE: { maxRequests: 20, windowMs: 60 * 1000 }, // 20 req/min
  UPLOAD_PRESIGNED: { maxRequests: 100, windowMs: 60 * 1000 }, // 100 presigned URLs/min per user
  UPLOAD_COMPLETE: { maxRequests: 100, windowMs: 60 * 1000 }, // 100 upload completions/min per user
  BOOKING: { maxRequests: 5, windowMs: 60 * 60 * 1000 }, // 5 req/hour
  
  // Admin routes rate limits
  ADMIN_READ: { maxRequests: 60, windowMs: 60 * 1000 }, // 60 req/min for GET operations
  ADMIN_WRITE: { maxRequests: 30, windowMs: 60 * 1000 }, // 30 req/min for POST/PATCH/DELETE
  STATS: { maxRequests: 30, windowMs: 60 * 1000 }, // 30 req/min (cached endpoints)
} as const;
