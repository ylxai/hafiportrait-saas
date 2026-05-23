import { getServerSession, type Session } from 'next-auth';
import { authOptions } from '@/lib/auth/options';
import { unauthorizedResponse } from '@/lib/api/response';
import { NextResponse } from 'next/server';

/**
 * Single source of truth for admin route authentication.
 *
 * Replaces 18+ duplicated `checkAuth()` helpers that previously lived
 * inline in each `src/app/api/admin/*` route. Each duplicate had subtle
 * differences:
 *   - Some returned `errorResponse('Unauthorized', 401)` (custom shape)
 *   - Some returned `unauthorizedResponse()` (standard shape)
 *   - All did the same `getServerSession + session?.user` check
 *
 * Centralizing here gives consistent JSON shape (`unauthorizedResponse`),
 * lets us audit auth in one place, and removes ~10 lines of boilerplate
 * from every admin route.
 *
 * Usage:
 *   ```ts
 *   const auth = await requireAdminAuth();
 *   if (auth instanceof NextResponse) return auth;
 *   // auth.user.email is now safe to use
 *   ```
 *
 * Sprint 2 Task 2.1 (standardize auth pattern across admin API routes).
 */
export async function requireAdminAuth(): Promise<Session | NextResponse> {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return unauthorizedResponse();
  }
  return session;
}
