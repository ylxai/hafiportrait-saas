/**
 * Role-check helpers for NextAuth sessions.
 *
 * The `role` field on `session.user` is a free-form string today (not a TS
 * enum or DB enum), and historically mixed-case values have leaked in via
 * seeds, manual edits, and older auth flows. To avoid every call site
 * re-implementing the same `(role ?? '').toLowerCase() === 'x'` guard —
 * with the inevitable risk of one of them forgetting the null coalesce or
 * the case fold — we centralize the comparison here.
 *
 * Usage:
 *   const session = await getServerSession(authOptions);
 *   if (!isClientSession(session)) return unauthorizedResponse();
 *   // After the guard, TS narrows `session` to a non-null `Session`, so
 *   // `session.user.id` is accessible without an extra `?` chain.
 *
 * The helpers accept any `Session`-shaped value, including `null` /
 * `undefined`, so callers don't need to narrow before calling. They are
 * declared as TypeScript type predicates (`session is Session`) so a
 * passing check also informs the compiler that `session` is non-null.
 */
import type { Session } from 'next-auth';
import { ROLE_ADMIN, ROLE_CLIENT } from './role-constants';

/**
 * Normalize the role string off a possibly-missing session. Returns `''`
 * when the session, user, or role is absent so downstream comparisons
 * never have to repeat the null guard.
 */
function normalizeRole(session: Session | null | undefined): string {
  return (session?.user?.role ?? '').toLowerCase();
}

/**
 * True iff the session belongs to a signed-in CLIENT (case-insensitive).
 *
 * Returns false for anonymous, admin, or any other role — callers can use
 * this as a single guard before exposing client-only data. Acts as a TS
 * type predicate so the post-guard branch sees `session` as `Session`.
 */
export function isClientSession(
  session: Session | null | undefined,
): session is Session {
  return normalizeRole(session) === ROLE_CLIENT;
}

/**
 * True iff the session belongs to a signed-in ADMIN (case-insensitive).
 *
 * Mirrors `isClientSession` for admin-only routes/components so both
 * checks share identical null-handling and case-folding semantics.
 */
export function isAdminSession(
  session: Session | null | undefined,
): session is Session {
  return normalizeRole(session) === ROLE_ADMIN;
}
