import { getServerSession, type Session } from 'next-auth';
import { authOptions } from '@/lib/auth/options';
import { unauthorizedResponse, forbiddenResponse } from '@/lib/api/response';
import { NextResponse } from 'next/server';
import { isClientSession } from '@/lib/auth/role-helpers';

/**
 * Single source of truth for client portal route authentication AND
 * authorization.
 *
 * Mirrors `requireAdminAuth` for the client portal. Replaces duplicated
 * inline `getServerSession + isClientSession` patterns across 5 portal
 * routes that each had subtly different error responses.
 *
 * This helper:
 *   1. Returns 401 (`unauthorizedResponse`) when no session exists.
 *   2. Returns 403 (`forbiddenResponse`) when the session role isn't
 *      client — admin sessions are rejected from portal routes.
 *      Role checking is delegated to `isClientSession` from role-helpers.ts
 *      so middleware, route guards, and this helper all share the exact
 *      same normalization logic (trim + lowercase).
 *   3. Returns the validated `Session` on success.
 *
 * Usage:
 *   ```ts
 *   const auth = await requireClientAuth();
 *   if (auth instanceof NextResponse) return auth;
 *   // auth.user.email and auth.user.role === 'client' are now safe.
 *   ```
 *
 * Sprint 4 Task 4.2 (H2 — standardize auth pattern for portal routes).
 */
export async function requireClientAuth(): Promise<Session | NextResponse> {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return unauthorizedResponse();
  }
  // Reject non-client sessions (e.g. admin role) from portal routes.
  // Delegate to isClientSession so middleware, route-level guards, and
  // this helper all apply the exact same trim + lowercase normalization.
  if (!isClientSession(session)) {
    return forbiddenResponse();
  }
  return session;
}
