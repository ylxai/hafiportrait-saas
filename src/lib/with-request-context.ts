/**
 * Higher-order helper that lifts an HTTP route handler into the
 * request-scoped {@link runWithRequestContext} ALS scope.
 *
 * Why a wrapper instead of doing this in `src/middleware.ts`?
 * Next.js middleware runs in the Edge runtime, which does **not**
 * expose `node:async_hooks`. The Edge-side middleware is therefore
 * responsible only for *minting / forwarding* the `x-request-id`
 * header, and each Node-runtime route handler opts into the ALS
 * scope by wrapping its export with this helper:
 *
 * ```ts
 * import { withRequestContext } from '@/lib/with-request-context';
 *
 * export const POST = withRequestContext(async (request) => {
 *   // logger automatically tags every line with requestId
 * });
 * ```
 *
 * The wrapper reads `x-request-id` from the incoming request (set by
 * middleware), falls back to a freshly generated UUID when called
 * outside the middleware path (e.g. webhook routes that the
 * middleware deliberately skips), and runs the underlying handler
 * inside the ALS scope.
 */

import { runWithRequestContext } from '@/lib/request-context';

/** Header name we propagate the correlation ID under. */
export const REQUEST_ID_HEADER = 'x-request-id';

/**
 * Generate-or-reuse helper. Trims overlong header values to keep log
 * cardinality bounded — a malicious client cannot inflate our log
 * indices by sending a 64KB header.
 */
const MAX_REQUEST_ID_LENGTH = 128;

function normalizeRequestId(raw: string | null | undefined): string {
  if (raw && raw.length > 0 && raw.length <= MAX_REQUEST_ID_LENGTH) {
    return raw;
  }
  return globalThis.crypto.randomUUID();
}

/**
 * Wrap a Next.js App Router handler so the request runs inside an
 * AsyncLocalStorage scope keyed on the inbound `x-request-id` header
 * (or a freshly minted UUID).
 *
 * The wrapper preserves the handler's `(request, context?)` shape so
 * dynamic route segments like `[id]` keep working.
 */
export function withRequestContext<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  TArgs extends [Request, ...any[]],
  TResult,
>(handler: (...args: TArgs) => Promise<TResult> | TResult) {
  return (...args: TArgs): Promise<TResult> | TResult => {
    const [request] = args;
    const requestId = normalizeRequestId(
      request.headers.get(REQUEST_ID_HEADER),
    );
    return runWithRequestContext({ requestId }, () => handler(...args));
  };
}
