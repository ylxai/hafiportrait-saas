import { getServerSession, type Session } from 'next-auth';
import { authOptions } from '@/lib/auth/options';
import { unauthorizedResponse, forbiddenResponse } from '@/lib/api/response';
import { NextResponse } from 'next/server';

/**
 * Allowed admin role values. The User table stores roles as
 * lowercase strings (`role String @default("admin")` in the Prisma
 * schema), so the comparison is case-insensitive but the canonical
 * stored value is lowercase. Client sessions emit `role: "CLIENT"`,
 * which must NOT be granted admin access.
 *
 * Kept as a Set so future role additions ("super_admin", "support",
 * etc.) only need a one-line edit.
 */
const ADMIN_ROLES = new Set(['admin']);

/**
 * Single source of truth for admin route authentication AND
 * authorization.
 *
 * Replaces 18+ duplicated `checkAuth()` helpers that previously lived
 * inline in each `src/app/api/admin/*` route. Each duplicate had subtle
 * differences:
 *   - Some returned `errorResponse('Unauthorized', 401)` (custom shape)
 *   - Some returned `unauthorizedResponse()` (standard shape)
 *   - **None of them checked `role`** — any authenticated session
 *     (including a CLIENT session from the public client portal) would
 *     pass the existence check and reach admin route logic if any
 *     middleware was misconfigured. CodeAnt PR #111 flagged this as
 *     a MAJOR authorization bypass.
 *
 * This helper:
 *   1. Returns 401 (`unauthorizedResponse`) when no session exists.
 *   2. Returns 403 (`forbiddenResponse`) when the session role isn't
 *      in `ADMIN_ROLES` — non-admin authenticated users (CLIENT) get
 *      a clear forbidden response instead of slipping through.
 *   3. Returns the validated `Session` on success.
 *
 * Usage:
 *   ```ts
 *   const auth = await requireAdminAuth();
 *   if (auth instanceof NextResponse) return auth;
 *   // auth.user.email and auth.user.role === 'admin' are now safe.
 *   ```
 *
 * Sprint 2 Task 2.1 (standardize auth pattern across admin API routes).
 */
export async function requireAdminAuth(): Promise<Session | NextResponse> {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return unauthorizedResponse();
  }
  // CodeAnt MAJOR (PR #111): authenticated-but-not-admin sessions
  // (e.g. CLIENT role from the public client portal) must be rejected
  // by the admin auth helper itself, not just by middleware. Compare
  // case-insensitively so legacy capitalizations still resolve.
  const role = (session.user.role ?? '').toLowerCase();
  if (!ADMIN_ROLES.has(role)) {
    return forbiddenResponse();
  }
  return session;
}
