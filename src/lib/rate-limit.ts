import { redisCache } from './cache';
import { logger } from './logger';

export interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
}

export interface RateLimitResult {
  success: boolean;
  /**
   * Remaining quota in the current window. The fail-open path returns
   * `-1` as a sentinel meaning "limiter bypassed, quota unknown" so
   * callers that surface `remaining` as UX (countdown, "N requests
   * left") can detect the bypass and adjust their UI accordingly.
   * On every other path this is `>= 0`.
   */
  remaining: number;
  /**
   * Epoch ms at which the current window resets. On the fail-open path
   * this is synthetic (`now + windowMs`) and should be treated as a
   * placeholder, not a real reset deadline. Callers can detect the
   * fail-open path via `remaining === -1`.
   */
  resetAt: number;
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
 * Atomic INCR + EXPIRE + TTL via a single Lua script.
 *
 * Issuing INCR and EXPIRE as separate commands has a critical race: if
 * INCR succeeds but EXPIRE fails (network blip after the first command,
 * driver retry exhausted, etc.), the key is left without a TTL and
 * grows monotonically forever. Once it crosses `maxRequests`, the
 * affected user is rate-limited *permanently* until an operator runs
 * `DEL` manually. This was flagged as a CRITICAL bug by CodeAnt on PR
 * #110 — the booking endpoint and admin upload presigning would lock
 * users out indefinitely after a single transient Redis error.
 *
 * Wrapping the whole sequence in a Lua script makes it atomic from
 * Redis's perspective: either the new TTL is set together with the
 * incremented counter, or neither side effect lands.
 *
 * The script is also self-healing for "poisoned" keys left behind by
 * the previous non-atomic implementation: if `TTL == -1` (key exists
 * but has no expiry), we re-set the expiry so the bucket eventually
 * resets instead of remaining permanently rate-limited. Without this,
 * any user who tripped the bug on the old code would be stuck until
 * manual `DEL`. (Sourcery + CodeAnt CRITICAL on commit a1d74dc.)
 *
 * Returns `[count, ttlSeconds]` so the caller can compute `resetAt`
 * without a second round trip.
 */
const RATE_LIMIT_LUA = `
local key = KEYS[1]
local windowSeconds = tonumber(ARGV[1])
local count = redis.call('INCR', key)
local ttl = redis.call('TTL', key)
if count == 1 or ttl == -1 then
  redis.call('EXPIRE', key, windowSeconds)
  ttl = windowSeconds
end
return {count, ttl}
`;

/**
 * Register the rate-limit script once per Redis client so subsequent
 * invocations use `EVALSHA` automatically. ioredis caches the script's
 * SHA on the server after the first call and falls back to `EVAL` if
 * the script ever gets evicted (e.g. SCRIPT FLUSH after a Redis
 * restart). This avoids resending the script body on every request,
 * which matters because the rate limiter runs on the hot path of every
 * authenticated API call. (Gemini low on commit ccb2df5.)
 *
 * Wrapped in a one-shot guard: defineCommand throws if called twice
 * with the same name on the same client, and ioredis singleton
 * `redisCache` is reused across module reloads in dev (HMR).
 */
let scriptRegistered = false;
function ensureLuaScriptRegistered(): void {
  if (scriptRegistered || !redisCache) return;
  // Cast through unknown to declare the dynamic command on the client
  // type without polluting the public ioredis interface.
  const client = redisCache as unknown as {
    rateLimitIncr?: (key: string, windowSeconds: string) => Promise<[number, number]>;
    defineCommand: (name: string, options: { numberOfKeys: number; lua: string }) => void;
  };
  if (!client.rateLimitIncr) {
    client.defineCommand('rateLimitIncr', {
      numberOfKeys: 1,
      lua: RATE_LIMIT_LUA,
    });
  }
  scriptRegistered = true;
}

/**
 * Extract the route name from a rate-limit identifier without leaking
 * PII. Identifiers in this codebase use varying segment counts:
 *   - `booking:user@example.com`              (2 segments, email PII)
 *   - `upload-presigned:user-id-123`           (2 segments, opaque ID)
 *   - `admin:read:user@example.com`            (3 segments, email PII)
 *   - `export:clients:get`                     (3 segments, no PII)
 *
 * The previous `.slice(0, 2).join(':')` strategy assumed a 3-segment
 * shape and leaked the email half of every 2-segment identifier into
 * logs. Logging only the FIRST segment is the only shape-independent
 * way to keep PII out: the route family is enough to debug a Redis
 * outage, and identity-level detail belongs in audit logs (which are
 * access-controlled), not in operational warnings.
 *
 * (CodeAnt PR #110 MAJOR security finding + Gemini medium.)
 */
function routePrefixForLog(identifier: string): string {
  const colon = identifier.indexOf(':');
  return colon === -1 ? identifier : identifier.slice(0, colon);
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
 * operator can see the gap in enforcement, and return a sentinel
 * `remaining: -1` so callers can surface "quota unknown" instead of
 * showing a misleading "you have N requests left" countdown. Failing
 * closed (rejecting all requests) would turn a Redis outage into a
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
): Promise<RateLimitResult> {
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
      logger.warn('[API] rate_limit.bypass', {
        reason: 'DISABLE_RATE_LIMIT=true',
        vercel_env: process.env.VERCEL_ENV,
        route: routePrefixForLog(identifier),
        message: 'Rate limiting disabled globally - this warning will only appear once per process; route is from first bypassed request',
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
      return failOpen(identifier, now, windowMs, 'redis_not_configured');
    }

    // Atomic INCR + EXPIRE + TTL via the registered Lua script. ioredis
    // uses EVALSHA after the first call so we don't resend the script
    // body on every request. See RATE_LIMIT_LUA docstring for why this
    // MUST be a single atomic operation.
    ensureLuaScriptRegistered();
    const result = (await (
      redisCache as unknown as {
        rateLimitIncr: (key: string, windowSeconds: string) => Promise<[number, number]>;
      }
    ).rateLimitIncr(key, windowSeconds.toString())) as [number, number];

    const [count, ttl] = result;
    // TTL == 0 is a valid Redis state (last sub-second before expiry —
    // the key still exists but EXPIRE will fire imminently). Only the
    // negative sentinels (-1 = no expiry, -2 = key missing) should
    // trigger the synthetic fallback. Treating 0 as an error case
    // returned `now + windowMs` (full window) instead of an immediate
    // reset, which inflated Retry-After and locked clients out for
    // far longer than the actual cooldown. (CodeAnt MAJOR on commit
    // ccb2df5.)
    const resetAt = ttl >= 0 ? now + (ttl * 1000) : now + windowMs;

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
    return failOpen(identifier, now, windowMs, 'redis_error', error);
  }
}

/**
 * Fail-open path when the shared store is unreachable.
 *
 * Allows the request through but records a structured warning so the gap in
 * enforcement is observable. The first occurrence per process logs at
 * `warn`; subsequent occurrences are dropped to keep log volume bounded
 * during prolonged Redis outages.
 *
 * Returns `remaining: -1` as a sentinel so callers that surface quota in
 * their UI can detect the bypass and avoid misleading countdowns.
 */
function failOpen(
  identifier: string,
  now: number,
  windowMs: number,
  reason: 'redis_not_configured' | 'redis_error',
  error?: unknown,
): RateLimitResult {
  if (!redisUnavailableWarningLogged) {
    // Pass the raw error object to the logger — `src/lib/logger.ts` runs
    // `serializeError` on any context key named `err` or `error`, so the
    // structured log keeps the stack and error name. Manually extracting
    // `.message` would lose that diagnostic info.
    logger.warn('[API] rate_limit.fail_open', {
      reason,
      route: routePrefixForLog(identifier),
      vercel_env: process.env.VERCEL_ENV,
      err: error,
      message:
        'Rate-limit store unavailable — request allowed through. ' +
        'remaining=-1 in the response indicates the bypass; investigate ' +
        'Redis health. This warning logs once per process.',
    });
    redisUnavailableWarningLogged = true;
  }
  return {
    success: true,
    remaining: -1,
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
  BOOKING: { maxRequests: 5, windowMs: 60 * 60 * 1000 }, // 5 req/hour per email
  BOOKING_IP: { maxRequests: 10, windowMs: 60 * 60 * 1000 }, // 10 req/hour per IP
  // Public read endpoints — token-based gallery access
  PUBLIC_READ: { maxRequests: 60, windowMs: 60 * 1000 }, // 60 req/min per IP
  PUBLIC_GALLERY_DOWNLOAD: { maxRequests: 20, windowMs: 60 * 1000 }, // 20 downloads/min per IP
  PUBLIC_PAYMENT_SUBMIT: { maxRequests: 5, windowMs: 60 * 1000 }, // 5 payment submits/min per IP
  PAYMENT_PRESIGNED_CLIENT: { maxRequests: 10, windowMs: 60 * 1000 }, // 10 presigned URLs/min per client

  // Admin routes rate limits
  ADMIN_READ: { maxRequests: 60, windowMs: 60 * 1000 }, // 60 req/min for GET operations
  ADMIN_WRITE: { maxRequests: 30, windowMs: 60 * 1000 }, // 30 req/min for POST/PATCH/DELETE
  STATS: { maxRequests: 30, windowMs: 60 * 1000 }, // 30 req/min (cached endpoints)
} as const;
