import { NextResponse } from 'next/server';
import { checkRateLimit, RateLimitConfig } from './rate-limit';
import { rateLimitResponse } from './api/response';

/**
 * Enforce rate limiting for admin routes
 * Returns NextResponse if rate limited, null if allowed
 * 
 * Usage:
 *   const rateLimit = await enforceRateLimit({
 *     identifier: `clients:get:${auth.user.email}`,
 *     limit: RATE_LIMITS.ADMIN_READ
 *   });
 *   if (rateLimit) return rateLimit;
 */
export async function enforceRateLimit({
  identifier,
  limit,
}: {
  identifier: string;
  limit: RateLimitConfig;
}): Promise<NextResponse | null> {
  const result = await checkRateLimit(identifier, limit);

  if (!result.success) {
    const retryAfterSeconds = Math.ceil((result.resetAt - Date.now()) / 1000);
    return rateLimitResponse('Too many requests', retryAfterSeconds);
  }

  return null;
}
