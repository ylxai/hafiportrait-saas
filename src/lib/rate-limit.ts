import { redisCache } from './cache';

export interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
}

/**
 * Redis/Valkey-based rate limiter with fallback to in-memory
 * Persistent across server restarts and multi-instance deployments
 */
export async function checkRateLimit(
  identifier: string,
  config: RateLimitConfig
): Promise<{ success: boolean; remaining: number; resetAt: number }> {
  const key = `rate-limit:${identifier}`;
  const now = Date.now();
  const windowSeconds = Math.ceil(config.windowMs / 1000);

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
      const resetAt = ttl > 0 ? now + (ttl * 1000) : now + config.windowMs;

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
      resetAt: now + config.windowMs,
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
} as const;
