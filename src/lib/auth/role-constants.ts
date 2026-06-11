/**
 * Canonical role string constants and the `UserRole` union type.
 *
 * The `role` column in the database is a free-form string today (no DB or
 * TS enum), so the literal values 'admin' and 'client' have historically
 * been duplicated across the auth providers, middleware, route guards,
 * and helper utilities. Each duplication is a chance for a typo or a
 * mixed-case value (e.g. 'Admin') to slip in and silently bypass a
 * comparison.
 *
 * Centralizing the canonical lowercase strings here — and the `UserRole`
 * union derived from them — gives the rest of the codebase a single,
 * type-checked source of truth. Tokens are normalized to lowercase at
 * issue time (see options.ts) and compared against these constants
 * everywhere downstream.
 */

export const ROLE_ADMIN = 'admin' as const;
export const ROLE_CLIENT = 'client' as const;

export type UserRole = typeof ROLE_ADMIN | typeof ROLE_CLIENT;

/**
 * NextAuth CredentialsProvider IDs, decoupled from the role constants.
 *
 * These IDs are part of the session token structure and changing them
 * would invalidate all existing sessions, forcing every user to log in
 * again. By using distinct values (with '-credentials' suffix) instead
 * of reusing the role strings, we ensure provider IDs can never be
 * accidentally coupled to role semantics or confused with DB role values.
 *
 * WARNING: Changing these values will invalidate all existing sessions.
 * Coordinate with the team before modifying.
 */
export const PROVIDER_ID_ADMIN = 'admin-credentials' as const;
export const PROVIDER_ID_CLIENT = 'client-credentials' as const;

// Session conflict error code used by middleware → login pages
export const SESSION_CONFLICT_ERROR = 'SessionConflicts' as const;
