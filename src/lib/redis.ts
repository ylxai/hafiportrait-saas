import { Redis } from 'ioredis';
import { env } from './env';

// Parse Redis URL if provided (Aiven format: rediss://user:pass@host:port)
function parseRedisUrl(url: string) {
  try {
    const parsed = new URL(url);
    return {
      host: parsed.hostname,
      port: parseInt(parsed.port) || 6379,
      username: parsed.username || undefined,
      password: parsed.password || undefined,
      tls: parsed.protocol === 'rediss:' ? {} : undefined,
    };
  } catch {
    return null;
  }
}

// Create Redis client configuration
function createRedisConfig() {
  // Priority 1: Full URL (Aiven format)
  if (env.REDIS_URL) {
    const parsed = parseRedisUrl(env.REDIS_URL);
    if (parsed) {
      return {
        host: parsed.host,
        port: parsed.port,
        username: parsed.username,
        password: parsed.password,
        tls: parsed.tls ? { rejectUnauthorized: false } : undefined,
        retryStrategy: (times: number) => {
          const delay = Math.min(times * 50, 2000);
          return delay;
        },
        maxRetriesPerRequest: null,
        enableReadyCheck: true,
      };
    }
  }

  // Priority 2: Individual components
  if (env.REDIS_HOST) {
    return {
      host: env.REDIS_HOST,
      port: parseInt(env.REDIS_PORT || '6379'),
      password: env.REDIS_PASSWORD,
      tls: env.REDIS_PASSWORD ? { rejectUnauthorized: false } : undefined,
      retryStrategy: (times: number) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
    };
  }

  // Fallback: Local Redis (development)
  return {
    host: 'localhost',
    port: 6379,
    retryStrategy: (times: number) => {
      const delay = Math.min(times * 50, 2000);
      return delay;
    },
    maxRetriesPerRequest: null,
  };
}

// Create Redis client
const config = createRedisConfig();

export const redis = new Redis(config);

// Connection event handlers
redis.on('connect', () => {
  console.log('✅ Redis/Valkey connected');
});

redis.on('ready', () => {
  console.log('✅ Redis/Valkey ready');
});

redis.on('error', (err: Error) => {
  console.error('❌ Redis/Valkey error:', err.message);
});

redis.on('close', () => {
  console.log('⚠️ Redis/Valkey connection closed');
});

// Health check function
export async function checkRedisHealth(): Promise<boolean> {
  try {
    await redis.ping();
    return true;
  } catch {
    return false;
  }
}

// Graceful shutdown
export async function closeRedis(): Promise<void> {
  await redis.quit();
}
