/**
 * Shared constants for the request correlation ID system (Sprint 3 / Task 3.1).
 *
 * Centralised in a tiny module so both runtimes can import them without
 * duplicating literals:
 *   - Edge runtime: `src/middleware.ts` (mints / echoes the header)
 *   - Node runtime: `src/lib/with-request-context.ts` (opens the ALS scope)
 *
 * This file MUST stay free of runtime-specific imports (no `node:*`,
 * no `next/*`) so the Edge bundle can pick it up safely.
 */

/** Canonical HTTP header name carrying the request correlation ID. */
export const REQUEST_ID_HEADER = "x-request-id";

/**
 * Upper bound on accepted inbound `x-request-id` values.
 *
 * Trims overlong header values to keep log cardinality bounded — a
 * malicious client cannot inflate our log indices by sending a 64KB
 * header. Anything over this length is discarded and replaced with a
 * freshly minted UUID.
 */
export const MAX_REQUEST_ID_LENGTH = 128;
