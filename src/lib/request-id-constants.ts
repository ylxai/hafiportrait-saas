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
 * Rejects overlong header values to keep log cardinality bounded — a
 * malicious client cannot inflate our log indices by sending a 64KB
 * header. Anything over this length is discarded and replaced with a
 * freshly minted UUID (see {@link normalizeRequestId}).
 */
export const MAX_REQUEST_ID_LENGTH = 128;

/**
 * Allowed characters for an inbound `x-request-id` value.
 *
 * Restricted to the typical UUID/hex alphabet plus hyphens so a malicious
 * or misconfigured client cannot smuggle whitespace, control characters,
 * newlines, or non-printable bytes into log lines (which would break
 * structured logs, log-shipping pipelines, or dashboards that parse the
 * field). Anything outside this set is rejected and replaced with a
 * freshly minted UUID — see {@link normalizeRequestId}.
 */
const REQUEST_ID_ALLOWED_PATTERN = /^[a-zA-Z0-9-]+$/;

/**
 * Generate-or-reuse helper for the `x-request-id` value.
 *
 * Validation rules — failures fall through to a freshly minted UUID:
 *   - must be a non-empty string
 *   - must not exceed {@link MAX_REQUEST_ID_LENGTH}
 *   - must only contain alphanumerics and hyphens (the typical UUID
 *     alphabet); whitespace, control characters, and other punctuation
 *     are rejected so they cannot leak into log lines
 *
 * Overlong or malformed inputs are NOT truncated or sanitised — they
 * are discarded and replaced with a freshly minted UUID.
 *
 * Shared between the Edge-runtime middleware and the Node-runtime
 * `withRequestContext` wrapper so the validation rules cannot drift.
 * Keep this dependency-free (no `node:*`, no `next/*`) so the Edge
 * bundle can import it safely.
 */
export function normalizeRequestId(raw: string | null | undefined): string {
  if (
    typeof raw === "string" &&
    raw.length > 0 &&
    raw.length <= MAX_REQUEST_ID_LENGTH &&
    REQUEST_ID_ALLOWED_PATTERN.test(raw)
  ) {
    return raw;
  }

  // Preferred path: Web Crypto on globalThis. Available in:
  //   - Edge runtime (always)
  //   - Node.js >= 19 (where `globalThis.crypto` is the Web Crypto API)
  //   - Modern browsers
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  // Fallback for Node.js < 19, where Web Crypto isn't on globalThis yet.
  // This branch is unreachable from the Edge runtime (globalThis.crypto
  // is always present there), so the `require("crypto")` call only ever
  // executes in a Node.js process. We use `require` (not `import`) to
  // keep this module free of static `node:*` dependencies, which would
  // break the Edge bundle.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return (require("crypto") as typeof import("crypto")).randomUUID();
}
