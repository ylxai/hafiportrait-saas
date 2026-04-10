import Redis from 'ioredis';

const REDIS_URL = process.env.NEXT_SERVER_REDIS_URL || process.env.REDIS_URL || '';

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

const DEFAULT_TTL_SECONDS = 300; // 5 minutes

/**
 * Get data from cache, or fetch it and cache the result
 */
export async function getCachedData<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlSeconds: number = DEFAULT_TTL_SECONDS
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
  if (!redisCache) return;

  try {
    await new Promise<void>((resolve, reject) => {
      const stream = redisCache!.scanStream({
        match: `${prefix}*`,
        count: 100
      });
      
      const promises: Promise<number>[] = [];
      
      stream.on('data', (keys: string[]) => {
        if (keys.length > 0) {
          promises.push(redisCache!.del(...keys));
        }
      });
      
      stream.on('end', () => {
        Promise.all(promises).then(() => resolve()).catch(reject);
      });
      
      stream.on('error', (err: Error) => reject(err));
    });
  } catch (error) {
    console.error(`Redis cache error on INVALIDATE ${prefix}:`, error);
  }
}
