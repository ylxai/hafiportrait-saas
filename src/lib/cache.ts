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

  if (data === undefined || data === null) {
    return data;
  }

  const serialized = JSON.stringify(data, (_, value) =>
    typeof value === 'bigint' ? value.toString() : value
  );

  try {
    if (redisCache) {
      await redisCache.setex(key, ttlSeconds, serialized);
    }
  } catch (error) {
    console.error(`Redis cache error on SET ${key}:`, error);
  }

  return JSON.parse(serialized) as T;
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

/**
 * Close Redis connection gracefully
 * Call this on server shutdown (SIGTERM/SIGINT)
 */
export async function closeRedisConnection() {
  if (redisCache) {
    try {
      await redisCache.quit();
      console.log('[Redis] Connection closed gracefully');
    } catch (error) {
      console.error('[Redis] Error closing connection:', error);
    }
  }
}

// Register graceful shutdown handlers
if (typeof process !== 'undefined') {
  process.on('SIGTERM', async () => {
    await closeRedisConnection();
  });
  
  process.on('SIGINT', async () => {
    await closeRedisConnection();
    process.exit(0);
  });
}
