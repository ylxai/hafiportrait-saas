# Audit Fix Tasks — PhotoStudio SaaS

> Generated: 2026-05-23
> Base audit: full expert codebase review (skip .md files)

---

## Sprint Planning Overview

| Sprint | Scope | Effort Est. |
|--------|-------|-------------|
| **Sprint 1** | Kritis + High (Security, Reliability) | 2–3 hari |
| **Sprint 2** | Medium (Performance, Consistency) | 2 hari |
| **Sprint 3** | Low (Observability, Polish) | 1 hari |

---

## Sprint 1 — Kritis & High Priority

### Task 1.1: Fix Bulk Delete Flow (Queue-First → Collect-Then-Delete-Then-Enqueue)

- **Severity**: Kritis
- **File**: `src/app/api/admin/photos/bulk-delete/route.ts`
- **Line**: 125–210
- **Problem**: Endpoint queues storage deletion jobs **before** deleting DB rows. If queue succeeds but DB transaction fails, files are deleted from storage but DB records remain — users see ghost photos in UI that 404 on click.
- **Fix Direction**: Reverse the flow to match the canonical pattern already documented in `src/lib/cloudflare-queue.ts` (lines 999–1003):
  1. `const payloads = await collectPhotoDeletionPayloads(where)`
  2. `await prisma.$transaction([...DB delete...])`
  3. `await enqueueDeletionWithOutbox(payloads)`
- **Use**: `collectDeletionDataForTransaction()` to get both `usedByClient` map and `payloads` in one query, then run atomic Prisma transaction, then enqueue.
- **Acceptance Criteria**:
  - [ ] Bulk delete flow is: collect payloads → DB transaction delete → enqueue cleanup
  - [ ] If DB transaction fails, no storage deletion jobs are queued
  - [ ] If enqueue fails, outbox records the failure for admin retry
  - [ ] E2E test covers ghost-photo scenario (queue mock success + DB failure)

---

### Task 1.2: Split `env.ts` to Prevent Server-Only Env Leak to Browser

- **Severity**: Kritis
- **File**: `src/lib/env.ts`
- **Line**: 28
- **Problem**: On browser `typeof window !== 'undefined'` branch, the code casts `process.env` (empty or contains only `NEXT_PUBLIC_*`) to the full schema type. If any client component accidentally imports `env.ts`, it receives a type-safe object with all fields `undefined`, which can cause runtime crashes or silent misconfigurations.
- **Fix Direction**:
  - Create `src/lib/env.server.ts` — validates full schema, throws if `typeof window !== 'undefined'`
  - Create `src/lib/env.client.ts` — only validates `NEXT_PUBLIC_*` vars, safe for client import
  - Update all server imports from `env.ts` → `env.server.ts`
  - Update client imports (if any) to `env.client.ts`
  - Delete or deprecate `src/lib/env.ts` after migration
- **Acceptance Criteria**:
  - [ ] `env.server.ts` throws runtime error if imported in client bundle
  - [ ] `env.client.ts` only exposes `NEXT_PUBLIC_*` variables
  - [ ] No remaining imports of old `env.ts` in server code
  - [ ] Build passes (`npm run build`)

---

### Task 1.3: Add Replay Protection to Webhook Endpoints

- **Severity**: High
- **Files**:
  - `src/app/api/webhook/storage-deleted/route.ts` (line 23–37)
  - `src/app/api/webhook/thumbnail-generated/route.ts` (line 12–27)
- **Problem**: Both endpoints use simple Bearer token comparison (`timingSafeEqual` on raw secret). No timestamp, no HMAC signature, no replay window. An attacker who sniffs the token can replay the request indefinitely.
- **Fix Direction**:
  - Refactor both endpoints to use `verifyWebhookSignature()` from `src/lib/webhook-validation.ts`
  - Update Cloudflare Worker (`workers/deletion-worker.ts`) to send:
    - `x-webhook-signature`: HMAC-SHA256(timestamp + payload)
    - `x-webhook-timestamp`: ISO 8601 timestamp
  - Reject requests older than 5 minutes (replay window already defined in `webhook-validation.ts`)
- **Acceptance Criteria**:
  - [ ] Both webhook endpoints validate `x-webhook-signature` and `x-webhook-timestamp`
  - [ ] Missing/invalid signature returns 401
  - [ ] Timestamp older than 5 minutes returns 401 (`REPLAY_ATTACK`)
  - [ ] Worker sends correct headers (update worker code + `wrangler.toml` if needed)
  - [ ] Existing tests updated; new E2E test for replay rejection

---

### Task 1.4: Replace In-Memory Rate Limit Fallback

- **Severity**: High
- **File**: `src/lib/rate-limit.ts` (line 85–132)
- **Problem**: In-memory `Map` fallback is local to a single serverless instance. On Vercel, requests may hit different instances — attacker can bypass rate limits by distributing requests. Also `setInterval` runs forever in every instance.
- **Fix Direction**:
  - Remove `setInterval` entirely (not compatible with serverless)
  - Replace in-memory fallback with **Prisma-based** rate limit table, or use existing Redis/Valkey consistently
  - If Redis unavailable, degrade gracefully (allow request) rather than using isolated in-memory store
  - Optionally: implement a lightweight Prisma-backed counter:
    ```prisma
    model RateLimitBucket {
      id        String   @id // identifier
      count     Int      @default(0)
      resetAt   DateTime
      @@index([resetAt])
    }
    ```
- **Acceptance Criteria**:
  - [ ] `setInterval` removed from codebase
  - [ ] Rate limit works correctly across multiple serverless instances
  - [ ] If Redis unavailable, fallback behavior is safe (either allow or use shared store, never isolated-memory enforcement)
  - [ ] E2E rate limit test still passes without `waitForTimeout`

---

### Task 1.5: Parallelize Bulk Deletion Queue Calls

- **Severity**: High
- **File**: `src/lib/cloudflare-queue.ts` (line 373–406)
- **Problem**: `queueStorageDeletionBulk` iterates sequentially (`for...await`), making one HTTP POST per item. For 100 items at ~200ms each, total ~20s — dangerously close to Vercel function timeout (30s for `/api/admin/*`).
- **Fix Direction**:
  - Use `publishToQueueBulk()` (already implemented in the same file, lines 163–288) instead of calling worker per item
  - If worker endpoint is still needed for individual deletion tracking, batch with `Promise.all()` and concurrency limit (e.g., `p-limit` or manual semaphore with `MAX_CONCURRENT = 10`)
- **Acceptance Criteria**:
  - [ ] 100 deletion jobs complete in < 5 seconds (or use Cloudflare Queue batch API)
  - [ ] No sequential `await` inside a loop for network I/O
  - [ ] Partial failures are still tracked per item

---

### Task 1.6: Remove Hardcoded Cloudflare Worker URL

- **Severity**: High
- **File**: `src/lib/cloudflare-queue.ts` (line 22)
- **Problem**: Production worker URL is hardcoded as fallback:
  ```ts
  const WORKER_URL = process.env.CLOUDFLARE_WORKER_URL || 'https://photostudio-deletion-worker.masipah1973.workers.dev';
  ```
  If codebase is public, attacker knows the worker endpoint.
- **Fix Direction**:
  - Remove fallback string; throw explicit error if `CLOUDFLARE_WORKER_URL` is unset
  - Add `CLOUDFLARE_WORKER_URL` to `env.server.ts` validation (required in production)
- **Acceptance Criteria**:
  - [ ] No hardcoded URL in source
  - [ ] Missing env var throws clear error at startup
  - [ ] Production deploy uses env var exclusively

---

## Sprint 2 — Medium Priority

### Task 2.1: Standardize Auth Pattern Across Admin API Routes

- **Severity**: Medium
- **Files**: `src/app/api/admin/*/route.ts` (multiple)
- **Problem**: Inconsistent auth implementation:
  - Some use `checkAuth()` returning `NextResponse | Session`
  - Some use inline `getServerSession(authOptions)`
  - Some return `unauthorizedResponse()`, others `errorResponse('Unauthorized', 401)`
- **Fix Direction**:
  - Create `src/lib/auth/require-server-auth.ts` with a single helper that **throws** `ApiError` on failure
  - Update all admin routes to use `try/catch` with `instanceof ApiError` pattern
  - Remove per-file `checkAuth()` duplicates
- **Acceptance Criteria**:
  - [ ] All admin API routes use the same auth helper
  - [ ] No duplicate `checkAuth()` functions in route files
  - [ ] Auth failure returns consistent JSON shape: `{ success: false, error: "Unauthorized", errorCode: "UNAUTHORIZED" }`
  - [ ] Build & lint pass

---

### Task 2.2: Add Prisma Connection Pool Limit

- **Severity**: Medium
- **File**: `prisma/schema.prisma` (datasource)
- **Problem**: No `connection_limit` parameter in `DATABASE_URL`. Under high concurrent load on Vercel serverless, Prisma can exhaust PostgreSQL max connections.
- **Fix Direction**:
  - Append `?connection_limit=5&pool_timeout=10` to `DATABASE_URL` documentation / example `.env`
  - Or better: enable Prisma Accelerate (package `@prisma/extension-accelerate` already in `package.json`) and configure connection pooling via Accelerate
  - If using Accelerate, update `src/lib/db.ts` to instantiate Prisma with the extension
- **Acceptance Criteria**:
  - [ ] Connection limit documented in `.env.example` or README
  - [ ] If Accelerate is used, `src/lib/db.ts` imports and applies the extension
  - [ ] Build passes; no runtime connection exhaustion under load

---

### Task 2.3: Add API Body Size Limit

- **Severity**: Medium
- **File**: `next.config.ts` + specific route configs
- **Problem**: No body parser size limit on API routes. Malformed/large JSON payloads can cause memory exhaustion.
- **Fix Direction**:
  - Add `api.bodyParser.sizeLimit` config in `next.config.ts` (or per-route export)
  - Set reasonable limits per endpoint type:
    - Admin upload/complete: 1mb (small JSON)
    - Webhooks: 1mb
    - Batch operations: 5mb
- **Acceptance Criteria**:
  - [ ] Body size limit enforced on all `/api/*` routes
  - [ ] Oversized request returns 413 Payload Too Large
  - [ ] Existing functionality preserved for legitimate requests

---

### Task 2.4: Implement Counter Reconciliation Job

- **Severity**: Medium
- **Files**: `prisma/schema.prisma` (model `Client`), upload/delete flows
- **Problem**: `Client.usedStorage` and `Client.photoCount` are denormalized counters maintained by application code. Race conditions, partial rollbacks, or manual DB edits can cause drift from actual values.
- **Fix Direction**:
  - Create a reconciliation query that recalculates per-client aggregates from `Photo` rows:
    ```sql
    UPDATE "Client" c
    SET 
      "usedStorage" = COALESCE((
        SELECT SUM(p."fileSize") 
        FROM "Photo" p
        JOIN "Gallery" g ON p."galleryId" = g.id
        JOIN "Event" e ON g."eventId" = e.id
        WHERE e."clientId" = c.id
      ), 0),
      "photoCount" = COALESCE((
        SELECT COUNT(*) 
        FROM "Photo" p
        JOIN "Gallery" g ON p."galleryId" = g.id
        JOIN "Event" e ON g."eventId" = e.id
        WHERE e."clientId" = c.id
      ), 0)
    ```
  - Expose as admin API endpoint (e.g., `POST /api/admin/clients/reconcile`)
  - Optionally schedule via Cloudflare Cron Trigger (monthly or weekly)
- **Acceptance Criteria**:
  - [ ] Reconcile endpoint recalculates and fixes drifted counters
  - [ ] Endpoint is admin-only
  - [ ] Results returned: `{ reconciled: number, clients: [...] }`
  - [ ] E2E test simulates drift and verifies reconciliation

---

### Task 2.5: Fix `process.on` SIGTERM/SIGINT in Serverless

- **Severity**: Medium
- **File**: `src/lib/cache.ts` (line 114–122)
- **Problem**: `process.on('SIGTERM', ...)` and `process.on('SIGINT', ...)` are unreliable in Vercel serverless and may crash in Edge runtime if `process` is undefined.
- **Fix Direction**:
  - Wrap with `if (typeof process !== 'undefined' && process.on)` guard
  - Or move graceful shutdown to a Next.js custom server / instrumentation hook (`instrumentation.ts`)
  - Ensure Redis `quit()` is also called in `error.tsx` / global-error boundaries if feasible
- **Acceptance Criteria**:
  - [ ] No unconditional `process.on` calls in library code
  - [ ] Build passes for both Node.js and Edge targets
  - [ ] Redis connection does not leak on function cold-start cycles

---

### Task 2.6: Singleton Ably Rest Client

- **Severity**: Medium
- **File**: `src/lib/ably.ts` (line 16–21)
- **Problem**: `getAblyRestClient()` creates a new `Ably.Rest` instance on every call, causing repeated HTTP connection overhead.
- **Fix Direction**:
  - Apply singleton pattern identical to `getAblyClient()` (lines 4–14)
- **Acceptance Criteria**:
  - [ ] `getAblyRestClient()` returns cached instance after first call
  - [ ] No behavioral change for consumers
  - [ ] Build passes

---

## Sprint 3 — Low Priority (Observability & Polish)

### Task 3.1: Add Request Correlation ID Tracing

- **Severity**: Low
- **Scope**: Global (API routes, queue messages, webhooks)
- **Problem**: No `requestId` propagates across `presigned → complete → thumbnail worker → thumbnail-generated webhook`. Debugging production issues requires grepping logs by `photoId` or `uploadId` which is indirect.
- **Fix Direction**:
  - Generate `x-request-id` (UUID) at API entry (presigned route)
  - Pass through:
    - Queue messages (`publishToQueue`, `queueThumbnailGeneration`)
    - Webhook callbacks
    - Logger context (`logger.info('upload.presigned', { requestId, ... })`)
  - Optionally use `AsyncLocalStorage` from `node:async_hooks` to auto-inject requestId into all logs within a request
- **Acceptance Criteria**:
  - [ ] Every upload flow has a traceable `requestId`
  - [ ] Logs include `requestId` field
  - [ ] No manual passing needed in every function (AsyncLocalStorage or middleware)

---

### Task 3.2: Standardize Language in Error Messages

- **Severity**: Low
- **Scope**: All API routes and validation messages
- **Problem**: Error messages mix Indonesian and English inconsistently. Examples:
  - `"Gagal menyimpan foto (dedup path)"`
  - `"Upload session tidak memiliki fileHash"`
  - `"Failed to create client"`
- **Fix Direction**:
  - Standardize API error messages to **English** (machine-parseable, universal)
  - UI-facing text in frontend components can remain Indonesian
  - Create a constant map for common errors if reuse is frequent
- **Acceptance Criteria**:
  - [ ] All API route error responses use English
  - [ ] Validation messages (`zod`) use English
  - [ ] Logger events remain English (already mostly correct)
  - [ ] Frontend components may keep Indonesian for user-facing copy

---

### Task 3.3: Remove `process.env` Fallback in `getCloudinaryThumbnailUrl`

- **Severity**: Low
- **File**: `src/lib/cloudinary.ts` (line 29)
- **Problem**: Sync version of `getCloudinaryThumbnailUrl` falls back to `process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME`, violating the architecture rule that credentials come from DB (`StorageAccount`).
- **Fix Direction**:
  - Remove `process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` fallback from sync version
  - Force callers to pass `cloudName` explicitly or use `getCloudinaryThumbnailUrlAsync()`
  - Audit all callers to ensure they pass `cloudName` from DB
- **Acceptance Criteria**:
  - [ ] No `process.env` access in `cloudinary.ts`
  - [ ] All call sites provide `cloudName` or use async version
  - [ ] Build passes

---

## Pre-Flight Checklist (Run Before & After Each Sprint)

```bash
# Before committing any sprint
npm run lint
npm run build
npm run test:e2e
```

- [ ] No new `any` types introduced
- [ ] No `waitForTimeout()` added to E2E tests
- [ ] No static Tailwind colors (OKLCH semantic only)
- [ ] No `alert()` calls (use `sonner toast()`)
- [ ] BigInt values serialized via `serializeBigInt()` before `JSON.stringify`

---

## Notes

- **Skip `.md` files policy**: This file itself is documentation and does not affect runtime.
- **Next.js 15 Async Patterns**: Any new route handler that reads `params` or `searchParams` must treat them as `Promise` (await before destructuring).
- **AGENTS.md Rules**: All fixes must comply with Explicit Prohibitions listed in project steering.

