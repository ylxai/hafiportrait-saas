/**
 * Shared authorization helpers for Server Actions.
 *
 * Centralised here because every admin-flavoured Server Action needs the
 * same gate, and review #74-1 (CodeAnt) flagged that the inline
 * `requireAdmin` we copy-pasted into `clients.ts`, `events.ts`, and
 * `packages.ts` only checked `session?.user` — *not* the role. Middleware
 * (`src/middleware.ts:91`) already blocks `/admin/*` and `/api/admin/*`
 * for non-admin tokens, so the user-facing impact is mitigated, but
 * defense-in-depth is cheap and the right thing to do for actions:
 *
 *   - If a future routing change exposes an action behind a non-admin
 *     page (e.g. someone imports `createClient` into a portal page), the
 *     middleware no longer protects it. The role check on the action
 *     itself does.
 *   - Authoring confusion: a Server Action's "endpoint" is implicit, so
 *     it's far easier to mistakenly expose one than a REST handler.
 *
 * The `role` value comes from `next-auth` JWT (`src/lib/auth/options.ts`)
 * which sets it from the User row at sign-in. Admin entries store
 * `'admin'` lowercase; a few routes compare with `.toLowerCase()` to
 * tolerate any future drift, so we do the same here.
 */

import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';

export type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string };

/**
 * Resolve the current admin session. Returns a `success: false` result
 * if the caller is unauthenticated *or* signed in as a non-admin role
 * (typically a `CLIENT` token from the portal flow).
 *
 * Callers should `if (!auth.success) return auth;` so the error shape
 * propagates straight back to the React `useTransition` hook.
 */
export async function requireAdmin(): Promise<ActionResult<true>> {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return { success: false, error: 'Unauthorized' };
  }
  // Defensive: the role string is normalised lowercase at sign-in for
  // admin users, but other code paths in the project compare with
  // `.toLowerCase()` (e.g. `src/app/api/ably/token/route.ts:74`). Match
  // that convention so a stray `'Admin'` in a custom JWT can't sneak
  // through.
  const role = (session.user as { role?: unknown }).role;
  if (typeof role !== 'string' || role.toLowerCase() !== 'admin') {
    return { success: false, error: 'Forbidden' };
  }
  return { success: true, data: true };
}
