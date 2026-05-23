import { redisCache } from './cache';
import { logger } from './logger';

export interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
}

// In-memory flag to log DISABLE_RATE_LIMIT warning only once per process
let disableRateLimitWarningLogged = false;
// In-memory flag to log Redis-unavailable fail-open warning only once per
// process. Avoids flooding logs every request when Redis is down.
let redisUnavailableWarningLogged = false;

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
 * Redis/Valkey-based distributed rate limiter.
 *
 * Designed for Vercel serverless: every check goes through the shared Redis
 * store so a request hitting instance A is rate-limited consistently with a
 * request hitting instance B. There is no in-memory fallback because:
 *
 *   - A `Map` is local to a single function instance. Rate limits enforced
 *     locally are trivially bypassed by an attacker who fans requests out
 *     across instances.
 *   - `setInterval` for cleanup runs forever in every spawned instance and
 *     leaks resources in serverless environments that recycle workers
 *     unpredictably.
 *
 * If Redis is unavailable (no client configured, or the operation throws)
 * we **fail open**: allow the request, log a structured warning so an
 * operator can see the gap in enforcement, and return a "successful" check.
 * Failing closed (rejecting all requests) would turn a Redis outage into a
 * full outage of the API; failing open with logging is the documented
 * trade-off in `docs/audit-tasks.md` Task 1.4 acceptance criteria.
 *
 * Bypass logic:
 * - Vercel preview deployments (VERCEL_ENV=preview): rate limiting disabled
 *   for testing.
 * - Emergency override (DISABLE_RATE_LIMIT=true): manual bypass for any
 *   environment.
 *
 * Closes Sprint 1 Task 1.4 (replace in-memory rate-limit fallback).
 */
export async function checkRateLimit(
  identifier: string,
  config: RateLimitConfig
): Promise<{ success: boolean; remaining: number; resetAt: number }> {
  const now = Date.now();
  const windowMs = effectiveWindowMs(config);

  // 1. Bypass in Vercel preview deployments (development/testing)
  if (process.env.VERCEL_ENV === 'preview') {
    return {
      success: true,
      remaining: config.maxRequests,
      resetAt: now + windowMs,
    };
  }

  // 2. Emergency bypass (requires manual env var, works in any environment)
  if (process.env.DISABLE_RATE_LIMIT === 'true') {
    // Log warning only once per process to avoid flooding logs during incidents
    if (!disableRateLimitWarningLogged) {
      // Extract route prefix without PII (e.g., "analytics:get" from "analytics:get:user@example.com")
      const routePrefix = identifier.split(':').slice(0, 2).join(':');

      logger.warn('[API] rate_limit.bypass', {
        reason: 'DISABLE_RATE_LIMIT=true',
        vercel_env: process.env.VERCEL_ENV,
        route_prefix: routePrefix,
        message: 'Rate limiting disabled globally - this warning will only appear once per process; route_prefix is from first bypassed request',
      });
      disableRateLimitWarningLogged = true;
    }

    return {
      success: true,
      remaining: config.maxRequests,
      resetAt: now + windowMs,
    };
  }

  const key = `rate-limit:${identifier}`;
  const windowSeconds = Math.ceil(windowMs / 1000);

  try {
    if (!redisCache) {
      return failOpen(identifier, config, now, windowMs, 'redis_not_configured');
    }

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
  } catch (error) {
    return failOpen(identifier, config, now, windowMs, 'redis_error', error);
  }
}

/**
 * Fail-open path when the shared store is unreachable.
 *
 * Allows the request through but records a structured warning so the gap in
 * enforcement is observable. The first occurrence per process logs at
 * `warn`; subsequent occurrences are dropped to keep log volume bounded
 * during prolonged Redis outages.
 */
function failOpen(
  identifier: string,
  config: RateLimitConfig,
  now: number,
  windowMs: number,
  reason: 'redis_not_configured' | 'redis_error',
  error?: unknown,
): { success: boolean; remaining: number; resetAt: number } {
  if (!redisUnavailableWarningLogged) {
    const routePrefix = identifier.split(':').slice(0, 2).join(':');
    logger.warn('[API] rate_limit.fail_open', {
      reason,
      route_prefix: routePrefix,
      vercel_env: process.env.VERCEL_ENV,
      err: error instanceof Error ? error.message : error,
      message:
        'Rate-limit store unavailable — request allowed through. ' +
        'This warning logs once per process; investigate Redis health.',
    });
    redisUnavailableWarningLogged = true;
  }
  return {
    success: true,
    remaining: config.maxRequests,
    resetAt: now + windowMs,
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
