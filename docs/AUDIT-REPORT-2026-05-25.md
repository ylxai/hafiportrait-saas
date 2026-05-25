# 🛡️ Codebase Audit Report

> **Repository:** `ylxai/hafiportrait-saas`
> **Date:** 2026-05-25
> **Auditor:** Hermes AI Agent (Claude Opus 4.7 subagent)
> **Scope:** `src/lib/`, `src/app/api/**`, `workers/`, `prisma/schema.prisma`
> **Baseline:** 2026-05-21 audit (B+ 90/100), Sprint 1–2 PRs merged (#97–#121)

---

## 📊 Executive Summary

| Category | Previous | Current | Trend |
|---|---|---|---|
| **Overall** | B+ (90) | **B+ (88)** | ↘ -2 |
| Security | A- (95) | **B+ (87)** | ↘ -8 |
| Architecture | C+ (75) | **B (82)** | ↗ +7 |
| Code Quality | A- (92) | **B+ (85)** | ↘ -7 |
| Database | A- (92) | **A- (92)** | → |
| UI/UX | A+ (96) | **A+ (96)** | → |
| Observability | n/a | **C+ (75)** | new |

**What changed:**
- ✅ Architecture climbed from C+ → B (+7) — Sprint 1–2 fixes paid off
- ❌ Security drops A- → B+ (-8) — new plaintext secret leak found (C1)
- ❌ Code Quality drops slightly — `console.*` count grew with new code paths
- ❌ Observability new category at C+ — Sprint 3 Task 3.1 only 40% done

**Finding counts:** 2 Critical · 7 High · 11 Medium · 8 Low

**Path to A- (92):** Fix C1 (+3) + wire C2 (+2) + fix H1/H3/H6 (+3) = +8 points

---

## 🔴 Critical Issues (Fix Immediately)

### C1. Plaintext Storage Credentials Returned to Browser

> **Status:** ❌ Open
> **Severity:** Critical
> **CVSS:** 9.1

**Files:**
- `src/app/api/admin/storage-accounts/route.ts` — GET (line ~105), POST (line ~122), PATCH (line ~183)

**Problem:**

`prisma.storageAccount.findMany()` is called with **no `select` clause**, so the full row including `apiSecret`, `secretKey`, `secondaryApiSecret`, `secondarySecretKey` is serialized to the admin browser as JSON. Same on POST/PATCH responses.

Anyone with admin role (or a CSRF-stolen session, or a compromised browser extension) can read R2/Cloudinary secrets in cleartext from the Network panel.

Compare to `rotation/route.ts:66-105` which correctly masks with `hasSecondaryApiKey: !!account.secondaryApiKey`.

```typescript
// ❌ CURRENT — leaks all secret fields
const accounts = await prisma.storageAccount.findMany({
  where: { userId: session.user.id }
  // no select → full row returned
});
return successResponse({ accounts });

// ✅ FIX — explicit select, exclude secrets
const accounts = await prisma.storageAccount.findMany({
  where: { userId: session.user.id },
  select: {
    id: true,
    provider: true,
    cloudName: true,
    apiKey: true,
    // apiSecret: EXCLUDED
    // secretKey: EXCLUDED
    isDefault: true,
    createdAt: true,
    hasSecondaryKey: true, // boolean mask
  }
});
```

**Impact:** Leaked secrets grant full access to R2 + Cloudinary across all tenants.

**Fix:**
1. Add explicit `select` to all 3 endpoints (GET/POST/PATCH)
2. Mirror masking pattern from `rotation/route.ts`
3. Add unit test asserting response shape excludes secret fields

---

### C2. `withRequestContext` Wrapper Never Wired to Route Handlers

> **Status:** ❌ Open (Sprint 3 Task 3.1 — 40% done)
> **Severity:** Critical (for observability) / High (for ops)

**Files:** All 53 route handlers under `src/app/api/`

**Problem:**

`src/lib/with-request-context.ts` exists and wraps a handler in `runWithRequestContext({ requestId }, handler)`, but **zero route handlers import or use it**. The middleware sets `x-request-id` on the response (good for client correlation), but the AsyncLocalStorage scope is never opened on the Node side.

Result: `getRequestId()` inside `cloudflare-queue.ts:99` and `logger.ts` always returns `undefined`. Queue messages and webhook callbacks do NOT carry `requestId`. The acceptance criterion "logs include requestId field" is silently failing.

```typescript
// ❌ CURRENT — ALS scope never opens
export async function POST(request: Request) {
  const session = await requireAdminAuth();
  // logger.info calls here have requestId: undefined
}

// ✅ FIX — wrap with withRequestContext
import { withRequestContext } from '@/lib/with-request-context';

export const POST = withRequestContext(async (request: Request) => {
  const session = await requireAdminAuth();
  // logger.info calls here auto-inject requestId
});
```

**Fix:** Mass-wrap all route exports. One-shot codemod across `src/app/api/**/route.ts` (~15 min mechanical work).

**Acceptance:** Confirm a sample admin route's logs include `requestId` matching the `x-request-id` response header.

---

## 🟠 High Priority Issues

### H1. Portal Routes — Unbounded Queries (No Pagination)

> **Status:** ❌ Open
> **Files:** `src/app/api/portal/dashboard/route.ts:14-37`, `src/app/api/portal/invoices/route.ts:14-32`

**Problem:** `prisma.gallery.findMany` with no `take/limit`. A client with 1000 galleries forces a 1000-row payload + N+1 `_count` roundtrips on every dashboard load. AGENTS.md mandates "NO unbounded queries (always paginate)".

**Fix:** Add `take: PAGE_SIZE`, cursor-based pagination (`parseCursorSafe` already exists in `@/types/pagination`), surface `pagination` in response like `portal/gallery/[token]/route.ts` does.

---

### H2. Portal Routes — No Shared Auth Helper

> **Status:** ❌ Open
> **Files:** `portal/dashboard/route.ts:9-12`, `portal/invoices/route.ts:9-12`, `portal/profile/route.ts:21-23`, `portal/gallery/[token]/route.ts:21-24`, `portal/gallery/[token]/submit/route.ts:13-16`

**Problem:** All 5 portal routes duplicate inline `getServerSession + isClientSession` with subtly different error responses (`unauthorizedResponse()` vs `errorResponse('Unauthorized', 401)`). Sprint 2 Task 2.1 fixed this for admin via `requireAdminAuth` but portal was skipped.

**Fix:** Create `src/lib/auth/require-client-auth.ts` mirroring `requireAdminAuth`. Migrate all 5 files.

---

### H3. `console.*` Still Pervasive in Server Code

> **Status:** ❌ Open
> **Count:** 63 hits in `src/lib/`, 84 hits in `src/app/api/` (147 total)

**Hotspots:**
- `cloudflare-queue.ts` — 15 sites in queue hot path
- `storage/deletion.ts` — 9 sites
- `ably.ts` — 9 sites
- All ~30 admin route catch-blocks still use `console.error('Error fetching X:', error)`

**Problem:** AGENTS.md mandates `logger` for server code. `console.*` bypasses ALS-injected `requestId` (once C2 lands) and doesn't serialize errors structurally.

**Fix:** Bulk codemod replacing `console.{log,warn,error}` with `logger.{info,warn,error}` + snake_case event name. Use `{ err: error }` so `serializeError` runs.

---

### H4. Body Size Limit Applied to Only 3/53 Routes

> **Status:** ❌ Open (Sprint 2 Task 2.3 partial)
> **Coverage:** `enforceBodySizeLimit` wired on `photos/bulk-delete`, `webhook/storage-deleted`, `webhook/thumbnail-generated` only

**Problem:** All other 50+ routes accept arbitrarily large bodies. POST/PATCH on `/api/admin/clients`, `/api/admin/events`, `/api/admin/galleries`, `/api/admin/storage-accounts`, all `/api/portal/*`, and `/api/public/booking` are uncapped.

**Fix:** Add `enforceBodySizeLimit(request, BODY_LIMITS.JSON_SMALL)` early in every POST/PATCH handler. `JSON_BATCH` for bulk endpoints.

---

### H5. Events/Booking Retry Loop Without Backoff

> **Status:** ❌ Open (carryover)
> **Files:** `events/route.ts:107-138`, `public/booking/route.ts:86-126`

**Problem:** Both `kodeBooking` retry loops have zero backoff between collisions. Under burst load, 5 retries fire in ~1ms.

**Fix:**
```typescript
await new Promise(r => setTimeout(r, Math.min(100 * 2 ** attempt, 1000)));
```
Or migrate to UUIDv7/nanoid (already imported elsewhere).

---

### H6. Queue Helpers Select Full StorageAccount Rows Including Secrets

> **Status:** ❌ Open
> **Files:** `src/lib/cloudflare-queue.ts:820-844, 976-1004`, `gallery/[id]/photos/[photoId]/route.ts:76-105`, `gallery/[id]/photos/bulk/route.ts:62-75`

**Problem:** Deletion path pulls full `StorageAccount` rows (with `apiSecret`, `secretKey`, `secondaryApiSecret`, `secondarySecretKey`) into Node memory just to extract `cloudName + apiKey + apiSecret`. Any unhandled `console.log` or error serialization could spill secrets to logs.

**Fix:** Add explicit `select` to every storage account fetch, or centralize through `getStorageCredentials(accountId)` (already exists in `lib/storage/accounts.ts:97`).

---

### H7. `decreaseStorageUsage` Race Condition (Read-Then-Write)

> **Status:** ❌ Open
> **File:** `src/lib/storage/accounts.ts:56-75`

**Problem:** Reads `account.usedStorage` then writes decremented value inside a transaction. Postgres READ COMMITTED isolation does not prevent two concurrent decrements from both reading the same value and writing the same smaller result — double-counting bytes back. The "clamp to 0" check makes this less catastrophic but still drifts the counter under concurrent deletes.

**Fix:** Use atomic decrement:
```typescript
// ✅ Atomic — no read-then-write race
await prisma.storageAccount.updateMany({
  where: { id: accountId, usedStorage: { gte: fileSize } },
  data: { usedStorage: { decrement: fileSize } }
});
```
Mirror the upload-complete quota pattern.

---

## 🟠 High Priority Issues

### H1. Portal Routes — Unbounded Queries (No Pagination)

> **Status:** ❌ Open
> **Files:** `src/app/api/portal/dashboard/route.ts:14-37`, `src/app/api/portal/invoices/route.ts:14-32`

**Problem:** `prisma.gallery.findMany` with no `take/limit`. A client with 1000 galleries forces a 1000-row payload + N+1 `_count` roundtrips on every dashboard load. AGENTS.md mandates "NO unbounded queries (always paginate)".

**Fix:** Add `take: PAGE_SIZE`, cursor-based pagination (`parseCursorSafe` already in `@/types/pagination`), surface `pagination` in response like `portal/gallery/[token]/route.ts` does.

---

### H2. Portal Routes — No Shared Auth Helper

> **Status:** ❌ Open
> **Files:** `portal/dashboard/route.ts`, `portal/invoices/route.ts`, `portal/profile/route.ts`, `portal/gallery/[token]/route.ts`, `portal/gallery/[token]/submit/route.ts`

**Problem:** All 5 portal routes duplicate inline `getServerSession + isClientSession` with subtly different error responses. Sprint 2 Task 2.1 fixed this for admin via `requireAdminAuth` but portal was skipped.

**Fix:** Create `src/lib/auth/require-client-auth.ts` mirroring `requireAdminAuth`. Migrate all 5 files.

---

### H3. `console.*` Still Pervasive in Server Code

> **Status:** ❌ Open
> **Count:** 63 hits in `src/lib/`, 84 hits in `src/app/api/` (147 total)

**Hotspots:**
- `cloudflare-queue.ts` — 15 sites in queue hot path
- `storage/deletion.ts` — 9 sites
- `ably.ts` — 9 sites
- All ~30 admin route catch-blocks still use `console.error('Error fetching X:', error)`

**Problem:** AGENTS.md mandates `logger` for server code. `console.*` bypasses ALS-injected `requestId` and doesn't serialize errors structurally.

**Fix:** Bulk codemod replacing `console.{log,warn,error}` with `logger.{info,warn,error}` + snake_case event name. Use `{ err: error }` so `serializeError` runs.

---

### H4. Body Size Limit Applied to Only 3/53 Routes

> **Status:** ❌ Open (Sprint 2 Task 2.3 partial)

**Problem:** `enforceBodySizeLimit` wired on only 3 routes. All other 50+ routes accept arbitrarily large bodies — `/api/admin/clients`, `/api/admin/events`, `/api/admin/galleries`, `/api/admin/storage-accounts`, all `/api/portal/*`, `/api/public/booking`.

**Fix:** Add `enforceBodySizeLimit(request, BODY_LIMITS.JSON_SMALL)` early in every POST/PATCH handler. `JSON_BATCH` for bulk endpoints.

---

### H5. Events/Booking Retry Loop Without Backoff

> **Status:** ❌ Open (carryover)
> **Files:** `events/route.ts:107-138`, `public/booking/route.ts:86-126`

**Problem:** Both `kodeBooking` retry loops have zero backoff. Under burst load, 5 retries fire in ~1ms.

**Fix:**
```typescript
await new Promise(r => setTimeout(r, Math.min(100 * 2 ** attempt, 1000)));
```

---

### H6. Queue Helpers Select Full StorageAccount Rows Including Secrets

> **Status:** ❌ Open
> **Files:** `src/lib/cloudflare-queue.ts:820-844, 976-1004`, `gallery/[id]/photos/[photoId]/route.ts:76-105`

**Problem:** Deletion path pulls full `StorageAccount` rows (with `apiSecret`, `secretKey`, `secondaryApiSecret`, `secondarySecretKey`) into Node memory. Any unhandled `console.log` or error serialization could spill secrets to logs.

**Fix:** Add explicit `select` to every storage account fetch, or centralize through `getStorageCredentials(accountId)` (already exists in `lib/storage/accounts.ts:97`).

---

### H7. `decreaseStorageUsage` Race Condition (Read-Then-Write)

> **Status:** ❌ Open
> **File:** `src/lib/storage/accounts.ts:56-75`

**Problem:** Reads `account.usedStorage` then writes decremented value. Postgres READ COMMITTED does not prevent two concurrent decrements from double-counting bytes back.

**Fix:**
```typescript
// ✅ Atomic — no read-then-write race
await prisma.storageAccount.updateMany({
  where: { id: accountId, usedStorage: { gte: fileSize } },
  data: { usedStorage: { decrement: fileSize } }
});
```

---

## 🟡 Medium Priority Issues

### M1. `process.env` Cloudinary Fallback Still in 5 Callers

> **Status:** ⚠️ Partial (Sprint 3 Task 3.3 — cloudinary.ts fixed, callers not)
> **Files:**
> - `src/lib/gallery/load-public-gallery.ts:98`
> - `src/lib/storage/accounts.ts:166`
> - `src/app/api/admin/galleries/[id]/photos/route.ts:79`
> - `src/app/api/portal/gallery/[token]/route.ts:89`
> - `src/app/api/public/gallery/[token]/photos/[photoId]/route.ts:50`

**Problem:** These callers still inline-fallback to `process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME`. The task acceptance criterion (no `process.env` in `cloudinary.ts`) is technically met, but the spirit (DB as single source of truth) is not enforced at call sites.

**Fix:** Replace inline `?? process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` with `getCloudinaryConfig()` async helper, or strip the fallback entirely.

---

### M2. Rate Limiting Missing on 6 Routes

> **Status:** ❌ Open
> **Files:**
> - `src/app/api/admin/clients/quota/route.ts` (PATCH + GET)
> - `src/app/api/admin/clients/bulk/route.ts` (DELETE)
> - `src/app/api/admin/storage-accounts/rotation/route.ts` (POST/GET)
> - `src/app/api/ably/token/route.ts` (GET — token minting is expensive)
> - All `src/app/api/portal/*` routes

**Fix:** Apply `RATE_LIMITS.ADMIN_READ` / `ADMIN_WRITE` per file. Portal routes need a new `RATE_LIMITS.PORTAL_READ`.

---

### M3. `settings.upsert` P2002 Race (Carryover)

> **Status:** ❌ Open
> **File:** `src/app/api/admin/settings/route.ts:106-129`

**Problem:** Two concurrent first-time POSTs both hit the `create` branch and the second gets P2002. No try/catch retry.

**Fix:** Wrap in try/catch; on P2002, fall back to pure update.

---

### M4. `totalRevenue` Returned as String (Inconsistent Type)

> **Status:** ❌ Open (carryover)
> **File:** `src/app/api/admin/stats/route.ts:75`

**Problem:** `totalRevenue: revenueResult._sum.totalPrice?.toString() ?? "0"`. `totalPrice` is `Int`, not `BigInt` — string cast is unnecessary and inconsistent.

**Fix:** Standardize: `Int` aggregates → number; `BigInt` aggregates → string. Document the convention.

---

### M5. `totalViews` Returned as String (Inconsistent Type)

> **Status:** ❌ Open (carryover)
> **File:** `src/app/api/admin/analytics/route.ts:96`

Same issue as M4. `viewCount` is `Int` but returned as string.

---

### M6. `decreaseStorageUsage` Clamp Emits No Warning

> **Status:** ❌ Open
> **File:** `src/lib/storage/accounts.ts:70-71`

**Problem:** Clamps to `BigInt(0)` silently when triggered — drift goes invisible. The reconciliation endpoint exists but won't catch this in real time.

**Fix:**
```typescript
logger.warn('storage.decrease.clamped_to_zero', {
  accountId,
  attempted: fileSize.toString(),
  currentBefore: account.usedStorage.toString()
});
```

---

### M7. Search Endpoint Unbounded Per Type (Carryover)

> **Status:** ❌ Open
> **File:** `src/app/api/admin/search/route.ts`

**Problem:** `type=all` returns up to 30 rows with no global cap.

**Fix:** Add `limit` query param with max cap.

---

### M8. `auth instanceof NextResponse` Boilerplate in 30+ Routes

> **Status:** ❌ Open (architecture)

**Problem:** Every handler starts with:
```typescript
const auth = await requireAdminAuth();
if (auth instanceof NextResponse) return auth;
```
This is mechanical noise and a frequent source of bugs.

**Fix:** Convert `requireAdminAuth` to throw `ApiError` and add a centralized error-mapping wrapper. Combine with C2's `withRequestContext`:
```typescript
export const POST = withApiRoute(async (request, ctx) => {
  const session = await requireAdminAuth(); // throws on failure
  // ...
});
```

---

### M9. `request.json()` Try-Catch Duplicated 30+ Times

> **Status:** ❌ Open

**Problem:** Every POST/PATCH duplicates an identical 5-line try-catch around `request.json()`.

**Fix:** Add `parseJsonBody(request)` helper in `lib/api/`:
```typescript
export async function parseJsonBody<T>(request: Request): Promise<T> {
  try {
    return await request.json() as T;
  } catch {
    throw new ApiError('Invalid JSON body', 400, 'INVALID_BODY');
  }
}
```

---

### M10. `clients/quota` PATCH — No Rate Limit, No Body Size Check

> **Status:** ❌ Open
> **File:** `src/app/api/admin/clients/quota/route.ts:16-57`

High-trust write endpoint with no protection. Also still uses `console.log`/`console.error`.

---

### M11. `portal/profile` PATCH — No Idempotency Guard

> **Status:** ℹ️ Heads-up
> **File:** `src/app/api/portal/profile/route.ts:44-83`

Schema doesn't include `email` today so this is fine, but if email is added later, no P2002 handling exists. Defensive note for the next change.

---

## 🟢 Low Priority Issues

### L1. Magic Numbers Still in Multiple Files

> **Files:** `events/route.ts:103`, `clients/route.ts:15`, `public/booking/route.ts:8,12`, `upload/presigned/batch/route.ts:21`, `portal/gallery/[token]/route.ts:13`

**Problem:** `MAX_RETRIES = 5`, `BCRYPT_ROUNDS = 10`, `MAX_BATCH_SIZE = 50`, `PHOTOS_PER_PAGE = 20` hardcoded inline. Some constants already exist in `lib/upload/constants.ts` — finish the migration.

**Fix:** Centralize in `lib/api/constants.ts` or extend `lib/upload/constants.ts`.

---

### L2. Indonesian Comments Inside English Error Messages

> **Files:** `gallery/[id]/photos/bulk/route.ts:77`, `gallery/[id]/photos/[photoId]/route.ts:137`, `upload/complete/route.ts:100`

**Note:** User-facing API error responses are clean (Task 3.2 ✅). Internal comments are mixed Bahasa/English — allowed by task scope but worth cleaning for consistency.

---

### L3. `cleanupExpiredUploadSessions` Dual-Auth Flow Untested

> **File:** `src/app/api/admin/upload/cleanup/route.ts:46-59`

The dual-auth fix (PR #118) is correct; needs a test asserting CLIENT-role + valid cron secret returns 403, not 200.

---

### L4. `logQueueError` Bypasses Logger

> **File:** `src/lib/cloudflare-queue.ts:62-72`

Custom `logQueueError` function uses `console.*` directly, never auto-injects `requestId`.

**Fix:** Replace with `logger.error('queue.error', { ...metadata, err: error })`.

---

### L5. Reserved Word `package` in Response

> **File:** `src/app/api/admin/packages/route.ts:83`

`successResponse({ package: pkg }, 201)` — `package` is a reserved word in some contexts.

**Fix:** Rename to `successResponse({ data: pkg }, 201)` or `{ packageData: pkg }`.

---

### L6. `cleanupUploadSession` Fire-and-Forget Without Comment

> **File:** `src/app/api/admin/upload/complete/route.ts` (5 sites: lines 529, 173, 342, 381, 456)

`.catch(() => {})` silently swallows errors. At minimum add a comment explaining why failure is acceptable here.

---

### L7. `deletion-worker.ts` Uses `console.*` Heavily

> **File:** `workers/deletion-worker.ts` (21 sites)

**Note:** Workers run in Cloudflare Workers runtime where `console.*` IS the logger — this is acceptable. But consider tagging with `requestId` from inbound message body once C2 lands for end-to-end trace correlation.

---

### L8. Settings Cache Invalidation Not Done After Changes

> **File:** `src/app/api/admin/settings/route.ts`

No settings caching exists today so this is a heads-up only. If caching is added later, invalidation must be wired here.

---

## 📋 Sprint 3 Task Status

| Task | Status | Evidence |
|---|---|---|
| **3.1** Correlation ID tracing | ⚠️ **40% done** | Infrastructure (`request-context.ts`, `with-request-context.ts`, middleware header) exists. But `withRequestContext` NOT applied to any route handler. ALS scope never opens → `logger.*` calls don't auto-inject `requestId`. Queue messages always get `requestId: undefined`. **See C2.** |
| **3.2** Standardize errors to English | ✅ **DONE** | Zero hits for Indonesian phrases in `errorResponse(...)` calls. Zod validator messages are English. Internal comments mixed but allowed by task scope. |
| **3.3** Remove `process.env` fallback in cloudinary.ts | ⚠️ **Partial** | `cloudinary.ts` itself is clean ✅. But 5 callers still inline-fallback to `process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME`. **See M1.** |

**Sprint 3 overall: ~60% done** (1.5 of 3 tasks truly complete)

---

## 🏗️ Architecture Recommendations

### 1. Wire `withRequestContext` to All Route Handlers (closes C2)
Codemod scoped to `src/app/api/**/route.ts`. ETA ~1 hour including tests.

### 2. Introduce `withApiRoute` Higher-Order Wrapper
Combines: `withRequestContext` (ALS scope) + try/catch → `errorResponse` mapper + automatic body-size guard for POST/PATCH. Collapses ~15 lines of boilerplate per route into 1 import. Addresses M8 + H4 + C2 together.

```typescript
// src/lib/api/with-api-route.ts
export function withApiRoute(handler: RouteHandler) {
  return withRequestContext(async (request: Request, ctx: RouteContext) => {
    try {
      await enforceBodySizeLimit(request, BODY_LIMITS.JSON_SMALL);
      return await handler(request, ctx);
    } catch (err) {
      if (err instanceof ApiError) return errorResponse(err.message, err.status, err.code);
      logger.error('route.unhandled_error', { err });
      return errorResponse('Internal server error', 500, 'INTERNAL_ERROR');
    }
  });
}
```

### 3. Convert `requireAdminAuth` to Throw `ApiError`
Remove `instanceof NextResponse` checks from 30+ routes. Aligns with Sprint 2 Task 2.1 acceptance criterion that wasn't fully achieved.

### 4. Centralize Storage Credentials Access
`getStorageCredentials(accountId)` already exists in `lib/storage/accounts.ts:97` — just under-used. Add `select` clauses everywhere `prisma.storageAccount.findMany/findUnique` runs. Closes H6 and reduces C1 blast radius.

### 5. Mass Codemod `console` → `logger`
~150 sites, mechanical. Will improve observability once requestId injection (C2) works. Use `logger.{info,warn,error}('event.name', { err })` pattern.

### 6. Add `lib/api/parse-json.ts` Helper
Eliminates duplicated try-catch around `request.json()` in 30+ routes (M9).

### 7. Document StorageAccount API Response Contract
Add unit test asserting response shape excludes secret fields (C1 prevention).

### 8. Replace `decreaseStorageUsage` with Atomic Pattern
Use `updateMany` with `WHERE usedStorage >= fileSize` guard (H7). Emit structured warning when clamp triggers (M6).

---

## 📅 Sprint Planning

### Sprint 4 — Security & Observability (Priority: Critical/High)

| Task | Finding | Effort | Impact |
|---|---|---|---|
| Fix storage-accounts secret leak | C1 | 2h | +3 Security |
| Wire `withRequestContext` to all routes | C2 | 3h | +2 Observability |
| Add `require-client-auth.ts` + migrate portal | H2 | 2h | +1 Security |
| Fix `decreaseStorageUsage` atomic | H7 | 1h | +1 Database |
| Fix portal pagination | H1 | 2h | +1 Architecture |

**Sprint 4 target score: A- (92/100)**

### Sprint 5 — Code Quality (Priority: High/Medium)

| Task | Finding | Effort | Impact |
|---|---|---|---|
| Mass codemod console → logger | H3 | 3h | +2 Code Quality |
| Add body size limit to all routes | H4 | 2h | +1 Security |
| Add retry backoff | H5 | 1h | +1 Reliability |
| Fix H6 (select on storage fetches) | H6 | 2h | +1 Security |
| Fix M1 (cloudinary env fallback callers) | M1 | 1h | +1 Architecture |
| Fix M2 (rate limiting 6 routes) | M2 | 2h | +1 Security |
| Fix M3 (settings P2002 race) | M3 | 1h | +1 Reliability |

**Sprint 5 target score: A (95/100)**

### Sprint 6 — Polish (Priority: Medium/Low)

| Task | Finding | Effort |
|---|---|---|
| Introduce `withApiRoute` HOC | M8 | 3h |
| Add `parseJsonBody` helper | M9 | 1h |
| Fix M4/M5 (Int type consistency) | M4/M5 | 1h |
| Fix L1 (magic numbers) | L1 | 1h |
| Fix L4 (logQueueError → logger) | L4 | 30m |
| Fix L5 (reserved word `package`) | L5 | 30m |

---

## 🔒 Security Posture

| Area | Status |
|---|---|
| Auth — role validation | ✅ Secure (PRs #118-#120) |
| Auth — provider ID decoupling | ✅ Secure (PR #121) |
| Storage credentials in API response | ❌ **Leaking** (C1) |
| Storage credentials in memory | ❌ Full rows pulled (H6) |
| Rate limiting coverage | ⚠️ Partial (6 routes missing) |
| Body size limits | ⚠️ Partial (3/53 routes) |
| Webhook HMAC validation | ✅ Secure (PR #117) |
| Input validation (Zod) | ✅ Consistent |

---

## 📚 Related Documentation

- **Audit Tasks:** `docs/audit-tasks.md`
- **Project Guidelines:** `AGENTS.md`
- **Previous Audit:** Superseded by this report (2026-05-25)

---

**Report Generated:** 2026-05-25
**Next Review:** After Sprint 4 completion
