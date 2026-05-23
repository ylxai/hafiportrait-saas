import { errorResponse } from '@/lib/api/response';

/**
 * Body size limit guard for App Router API routes.
 *
 * Sprint 2 Task 2.3: Next.js App Router does NOT honor the
 * `api.bodyParser.sizeLimit` config that Pages Router supports — that
 * setting is silently ignored under the new router. Without an
 * explicit guard, an attacker can POST a multi-megabyte JSON payload
 * and force the route to allocate its full size in memory before any
 * handler logic runs, opening a memory-exhaustion DoS vector.
 *
 * This helper validates the `Content-Length` header against a
 * documented per-endpoint cap. If the header is missing (chunked /
 * streaming requests), we fall back to allowing the request through —
 * the platform's edge layer is the next backstop. If present and
 * over-budget, return 413 Payload Too Large immediately, before the
 * body is ever read.
 *
 * Usage:
 *   ```ts
 *   const tooLarge = enforceBodySizeLimit(request, BODY_LIMITS.JSON_SMALL);
 *   if (tooLarge) return tooLarge;
 *   // safe to await request.json() now
 *   ```
 */
export function enforceBodySizeLimit(
  request: Request,
  maxBytes: number,
): Response | null {
  const contentLength = request.headers.get('content-length');
  if (contentLength === null) {
    // No Content-Length — chunked or streaming request. Let the
    // platform's edge backstop handle it.
    return null;
  }

  const bytes = Number.parseInt(contentLength, 10);
  if (!Number.isFinite(bytes) || bytes < 0) {
    // Malformed header — treat as a hostile signal and reject.
    return errorResponse('Invalid Content-Length header', 400);
  }

  if (bytes > maxBytes) {
    return errorResponse(
      `Payload too large. Max ${maxBytes} bytes; received ${bytes}.`,
      413,
    );
  }

  return null;
}

/**
 * Documented per-endpoint body limits.
 *
 * - `JSON_SMALL`: small JSON payloads (single resource create/update,
 *   webhooks, auth callbacks). 1 MB is more than enough for any
 *   reasonable JSON document.
 * - `JSON_BATCH`: bulk operations (bulk delete, bulk update). 5 MB
 *   covers thousands of IDs without enabling abuse.
 * - `WEBHOOK`: webhook receivers (small structured payloads).
 *
 * Numbers chosen per `docs/audit-tasks.md` Task 2.3.
 */
export const BODY_LIMITS = {
  JSON_SMALL: 1 * 1024 * 1024, // 1 MB
  JSON_BATCH: 5 * 1024 * 1024, // 5 MB
  WEBHOOK: 1 * 1024 * 1024, // 1 MB
} as const;
