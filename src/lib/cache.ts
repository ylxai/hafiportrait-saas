import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL || '';

// Singleton instance to prevent multiple connections in development (HMR)
const globalForRedis = globalThis as unknown as {
  redis: Redis | undefined;
};

export const redisCache = globalForRedis.redis ?? (REDIS_URL ? new Redis(REDIS_URL, {
  maxRetriesPerRequest: 3,
  retryStrategy(times) {
    if (times > 3) {
      console.warn('Redis retry stopped.');
      return null;
    }
    return Math.min(times * 50, 2000);
  },
  tls: REDIS_URL.startsWith('rediss://') ? {} : undefined,
}) : undefined);

if (process.env.NODE_ENV !== 'production') {
  globalForRedis.redis = redisCache;
}

/**
 * Get data from cache, or fetch it and cache the result
 */
export async function getCachedData<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlSeconds: number = 300 // default 5 minutes
): Promise<T> {
  try {
    if (redisCache) {
      const cached = await redisCache.get(key);
      if (cached) {
        return JSON.parse(cached) as T;
      }
    }
  } catch (error) {
    console.error(`Redis cache error on GET ${key}:`, error);
    // Fallback to fetcher if cache read fails
  }

  const data = await fetcher();

  try {
    // Only cache if data exists and redis is configured
    if (redisCache && data !== undefined && data !== null) {
      // For Prisma BigInt serialization, pass replacer to stringify if needed.
      await redisCache.setex(key, ttlSeconds, JSON.stringify(data, (_, value) =>
        typeof value === 'bigint' ? value.toString() : value
      ));
    }
  } catch (error) {
    console.error(`Redis cache error on SET ${key}:`, error);
  }

  return data;
}

export async function invalidateCache(prefix: string) {
  try {
    if (!redisCache) return;
    const keys = await redisCache.keys(`${prefix}*`);
    if (keys.length > 0) {
      await redisCache.del(...keys);
    }
  } catch (error) {
    console.error(`Redis cache error on INVALIDATE ${prefix}:`, error);
  }
}
