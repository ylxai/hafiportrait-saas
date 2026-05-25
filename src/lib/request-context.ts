/**
 * Request-scoped context using AsyncLocalStorage.
 *
 * Auto-propagates a `requestId` through every async hop within a single
 * HTTP request — logs, queue publishes, and webhook callbacks pick it
 * up without manual threading.
 *
 * This module imports `node:async_hooks`, which is **not** available in
 * the Next.js Edge runtime. Keep this off the Edge import graph
 * (e.g., do not import it from `src/middleware.ts`). Edge code should
 * forward `x-request-id` via headers; the Node-side handler then
 * starts the ALS scope via {@link runWithRequestContext}.
 *
 * Sprint 3 / Task 3.1 — request correlation ID tracing.
 */

import { AsyncLocalStorage } from 'node:async_hooks';

export interface RequestContext {
  /** Stable correlation ID for this request, propagated through all async hops. */
  requestId: string;
}

/**
 * Module-level ALS instance. Single instance per process — surviving
 * dev-server hot reloads matters less because Next.js reloads the
 * module wholesale, but in production we want exactly one store
 * pinned to the Node process.
 */
const requestContextStorage = new AsyncLocalStorage<RequestContext>();

/**
 * Run `fn` inside a request-scoped context. All `getRequestId()` calls
 * (including those made indirectly by the structured logger) made
 * inside the callback — and any async work it spawns — observe the
 * supplied `context.requestId`.
 *
 * Safe to nest: an inner `runWithRequestContext` simply shadows the
 * outer scope for the duration of its callback.
 */
export function runWithRequestContext<T>(
  context: RequestContext,
  fn: () => T,
): T {
  return requestContextStorage.run(context, fn);
}

/**
 * Read the current request's correlation ID, if any. Returns
 * `undefined` outside a request scope (e.g. during boot, scheduled
 * jobs, or scripts) — callers must tolerate that.
 */
export function getRequestId(): string | undefined {
  return requestContextStorage.getStore()?.requestId;
}

/**
 * Read the entire request context. Mostly useful for forwarding into
 * downstream services (queue payloads, webhook callbacks).
 */
export function getRequestContext(): RequestContext | undefined {
  return requestContextStorage.getStore();
}
