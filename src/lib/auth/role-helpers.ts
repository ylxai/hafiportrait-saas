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
import type { JWT } from 'next-auth/jwt';
import { ROLE_ADMIN, ROLE_CLIENT } from './role-constants';

/**
 * Normalize an arbitrary raw role value into the canonical trimmed +
 * lower-cased string used for comparisons everywhere else. Accepts
 * `unknown` so callers can pass DB columns, JWT claims, or any other
 * loosely-typed source without first proving it's a string. Returns `''`
 * for null/undefined and coerces other primitives via `String()` so a
 * stray number/boolean from a legacy row can't blow up the call site.
 *
 * This is the single source of truth for role normalization — the
 * session/token helpers below all delegate here so the issue-time
 * normalization in `authOptions` and the read-time normalization in
 * middleware/route guards stay in lock-step.
 */
export function normalizeRawRole(value: unknown): string {
  if (value === undefined || value === null) return '';
  return String(value).trim().toLowerCase();
}

/**
 * Normalize the role string off a possibly-missing session. Returns `''`
 * when the session, user, or role is absent so downstream comparisons
 * never have to repeat the null guard.
 */
export function normalizeRole(session: Session | null | undefined): string {
  return normalizeRawRole(session?.user?.role);
}

/**
 * Normalize the role string off a NextAuth JWT (as returned by `getToken()`
 * inside middleware/edge runtime). Mirrors `normalizeRole` for sessions so
 * middleware and route-level guards apply identical trim + case-fold logic
 * to whatever was issued by the providers in `authOptions`. Returns `''`
 * when the token or its role is absent.
 *
 * `getToken()` is typed loosely (`JWT | null`) and our augmentation declares
 * `role: string`, but legacy tokens minted before the augmentation may carry
 * non-string values — `normalizeRawRole` handles the defensive String()
 * coercion so a stray number/boolean can't blow up middleware.
 */
export function normalizeTokenRole(token: JWT | null | undefined): string {
  return normalizeRawRole(token?.role);
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
