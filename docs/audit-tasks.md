# Audit Fix Tasks — PhotoStudio SaaS

> Updated: 2026-05-25
> Base audit: Full expert codebase review (2026-05-25)
> Full report: `docs/AUDIT-REPORT-2026-05-25.md`

---

## Sprint Status Overview

| Sprint | Scope | Status |
|--------|-------|--------|
| **Sprint 1** | Critical + High (Security, Reliability) | ✅ Done (PRs #97–#120) |
| **Sprint 2** | Medium (Performance, Consistency) | ✅ Done (PRs #97–#121) |
| **Sprint 3** | Low (Observability, Polish) | ✅ Done (2026-05-25) |
| **Sprint 4** | Security & Observability (new findings) | ✅ Done (2026-05-25) |
| **Sprint 5** | Code Quality (new findings) | ✅ Done (2026-05-25) |
| **Sprint 6** | Polish (new findings) | ✅ Done (2026-05-25) |

---

## Sprint 3 — Remaining Tasks

### Task 3.1: Wire `withRequestContext` to All Route Handlers

- **Severity**: Critical (C2)
- **Status**: ⚠️ 40% done — infrastructure exists, not wired
- **Problem**: `with-request-context.ts` exists but zero route handlers use it. `getRequestId()` always returns `undefined`. Queue messages don't carry `requestId`.
- **Fix**: Mass-wrap all route exports:
  ```typescript
  import { withRequestContext } from '@/lib/with-request-context';
  export const POST = withRequestContext(async (request) => { ... });
  ```
- **Acceptance**:
  - [ ] All route handlers wrapped with `withRequestContext`
  - [ ] Sample admin route logs include `requestId` matching `x-request-id` header
  - [ ] Queue messages carry `requestId`

### Task 3.3: Remove `process.env` Fallback — Remaining Callers

- **Severity**: Medium (M1)
- **Status**: ⚠️ Partial — `cloudinary.ts` fixed, 5 callers remain
- **Files**:
  - `src/lib/gallery/load-public-gallery.ts:98`
  - `src/lib/storage/accounts.ts:166`
  - `src/app/api/admin/galleries/[id]/photos/route.ts:79`
  - `src/app/api/portal/gallery/[token]/route.ts:89`
  - `src/app/api/public/gallery/[token]/photos/[photoId]/route.ts:50`
- **Fix**: Replace `?? process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` with `getCloudinaryConfig()` async helper
- **Acceptance**:
  - [ ] Zero `process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` references in codebase
  - [ ] All callers use DB-backed config

---

## Sprint 4 — Security & Observability

### Task 4.1: Fix Storage Credentials Secret Leak

- **Severity**: Critical (C1)
- **File**: `src/app/api/admin/storage-accounts/route.ts`
- **Problem**: GET/POST/PATCH returns full row including `apiSecret`, `secretKey`, `secondaryApiSecret`, `secondarySecretKey` to admin browser. No `select` clause.
- **Fix**:
  1. Add explicit `select` excluding secret fields to all 3 endpoints
  2. Mirror masking pattern from `rotation/route.ts`
  3. Add unit test asserting response excludes secret fields
- **Acceptance**:
  - [ ] GET response excludes `apiSecret`, `secretKey`, `secondaryApiSecret`, `secondarySecretKey`
  - [ ] POST/PATCH responses same
  - [ ] Unit test passes

### Task 4.2: Add `require-client-auth.ts` + Migrate Portal Routes

- **Severity**: High (H2)
- **Files**: 5 portal route handlers
- **Problem**: All 5 portal routes duplicate inline auth pattern with inconsistent error responses
- **Fix**: Create `src/lib/auth/require-client-auth.ts` mirroring `requireAdminAuth`. Migrate all 5 files.
- **Acceptance**:
  - [ ] `require-client-auth.ts` created
  - [ ] All 5 portal routes use it
  - [ ] Consistent error responses

### Task 4.3: Fix `decreaseStorageUsage` Race Condition

- **Severity**: High (H7)
- **File**: `src/lib/storage/accounts.ts:56-75`
- **Problem**: Read-then-write pattern allows concurrent decrements to double-count bytes
- **Fix**: Use atomic `updateMany` with `WHERE usedStorage >= fileSize` guard
- **Acceptance**:
  - [ ] No read-then-write pattern
  - [ ] Concurrent decrements handled correctly
  - [ ] Clamp emits `logger.warn` when triggered

### Task 4.4: Add Portal Route Pagination

- **Severity**: High (H1)
- **Files**: `portal/dashboard/route.ts`, `portal/invoices/route.ts`
- **Problem**: Unbounded `findMany` queries
- **Fix**: Add `take: PAGE_SIZE`, cursor-based pagination, surface `pagination` in response
- **Acceptance**:
  - [ ] Both routes paginated
  - [ ] Response includes `pagination` object
  - [ ] Default page size documented

---

## Sprint 5 — Code Quality

### Task 5.1: Mass Codemod `console.*` → `logger.*`

- **Severity**: High (H3)
- **Count**: 147 sites (63 in `src/lib/`, 84 in `src/app/api/`)
- **Fix**: Replace `console.{log,warn,error}` with `logger.{info,warn,error}` + snake_case event name + `{ err: error }`
- **Acceptance**:
  - [ ] Zero `console.log/warn/error` in `src/lib/` and `src/app/api/`
  - [ ] All errors use `{ err: error }` pattern

### Task 5.2: Add Body Size Limit to All Routes

- **Severity**: High (H4)
- **Problem**: `enforceBodySizeLimit` on only 3/53 routes
- **Fix**: Add to every POST/PATCH handler
- **Acceptance**:
  - [ ] All POST/PATCH routes have body size limit
  - [ ] Oversized request returns 413

### Task 5.3: Add Retry Backoff to Events/Booking

- **Severity**: High (H5)
- **Files**: `events/route.ts`, `public/booking/route.ts`
- **Fix**: Add exponential backoff between retry attempts
- **Acceptance**:
  - [ ] Retry loop has backoff: `Math.min(100 * 2**attempt, 1000)ms`

### Task 5.4: Fix StorageAccount Select in Queue Helpers

- **Severity**: High (H6)
- **Files**: `cloudflare-queue.ts`, gallery photo routes
- **Fix**: Add explicit `select` or use `getStorageCredentials(accountId)`
- **Acceptance**:
  - [ ] No full-row StorageAccount fetches in queue/deletion paths

### Task 5.5: Fix Rate Limiting on 6 Missing Routes

- **Severity**: Medium (M2)
- **Fix**: Apply `RATE_LIMITS.ADMIN_READ/WRITE` to missing routes, add `RATE_LIMITS.PORTAL_READ`
- **Acceptance**:
  - [ ] All 6 routes have rate limiting
  - [ ] Portal routes have appropriate limits

### Task 5.6: Fix `settings.upsert` P2002 Race

- **Severity**: Medium (M3)
- **File**: `src/app/api/admin/settings/route.ts`
- **Fix**: Wrap in try/catch; on P2002, fall back to pure update

### Task 5.7: Fix Int Type Consistency (totalRevenue, totalViews)

- **Severity**: Medium (M4/M5)
- **Fix**: `Int` aggregates → number; `BigInt` aggregates → string

---

## Sprint 6 — Polish

### Task 6.1: Introduce `withApiRoute` HOC

- **Severity**: Medium (M8)
- **Fix**: Combine `withRequestContext` + error mapping + body size guard into one wrapper

### Task 6.2: Add `parseJsonBody` Helper

- **Severity**: Medium (M9)
- **Fix**: Eliminate duplicated try-catch around `request.json()` in 30+ routes

### Task 6.3: Fix Magic Numbers

- **Severity**: Low (L1)
- **Fix**: Centralize in `lib/api/constants.ts`

### Task 6.4: Fix `logQueueError` → `logger`

- **Severity**: Low (L4)
- **File**: `src/lib/cloudflare-queue.ts:62-72`

### Task 6.5: Fix Reserved Word `package`

- **Severity**: Low (L5)
- **File**: `src/app/api/admin/packages/route.ts:83`
- **Fix**: Rename to `data` or `packageData`

---

## Pre-Flight Checklist

```bash
npm run lint
npm run build
npm run test:e2e
```

- [ ] No new `any` types
- [ ] No `waitForTimeout()` in E2E tests
- [ ] No static Tailwind colors (OKLCH semantic only)
- [ ] No `alert()` calls (use `sonner toast()`)
- [ ] BigInt values serialized via `serializeBigInt()` before `JSON.stringify`
- [ ] No `console.*` in server code (use `logger.*`)
- [ ] No unbounded queries (always paginate)
- [ ] Delete branch after PR merge (remote + local)
