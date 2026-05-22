# 🛡️ Codebase Audit Report

> **Repository:** `ylxai/hafiportrait-saas`  
> **Commit:** `0854148` (`fix: expand rollback scope and use shared constants in gallery upload`)  
> **Date:** 2026-05-22  
> **Auditor:** GitHub Copilot Coding Agent  
> **Scope:** `src/` directory (API routes, lib, components) — all files except `.md` (AGENTS.md excluded from skip)

---

## 📊 Executive Summary

| Severity | Count | Categories |
|----------|-------|-----------|
| 🔴 Critical | 4 | Data integrity, Auth, Numeric precision |
| 🟠 High | 6 | Rate limiting, Validation, Logging, Transactions |
| 🟡 Medium | 5 | Serialization, Optimization, Race conditions |
| 🟢 Low | 4 | Consistency, Code patterns |
| **Total** | **19** | |
| **Fixed** | **3** | **C2, C3, H3/H4 (partial)** |

**Overall Assessment:** The codebase is well-structured with good patterns (Zod validation, BigInt serialization, atomic updates). However, several critical data integrity issues remain, particularly around the new `photoCount` column logic. Rate limiting and logging consistency are the largest gaps across the API surface.

---

## ✅ Fixes Applied (2026-05-22)

| Finding | Status | Commit | Notes |
|---------|--------|--------|-------|
| **C2** | ✅ **Fixed** | `870e1be`, `0854148` | Atomic quota check with `updateMany` + `lte` guard. Rollback of both `usedStorage` and `StorageAccount` counters on failure. |
| **C3** | ✅ **Fixed** | `870e1be` | Accept `fileSize` as `z.string().regex(/^\d+$/)` with `BigInt()` try/catch. `number` kept for b/w compat with `MAX_SAFE_INTEGER` guard. `console.*` replaced with `logger.*`. |
| **H3/H4** | ✅ **Addressed** | `0854148` | `gallery/[id]/photos/route.ts` — wrapped entire upload flow in single try block, replaced all `console.*` with `logger.*`. Remaining routes still need attention. |
| **H4** | ✅ **Addressed** | `0854148` | Expanded try block covers all post-quota operations. Added `decreaseStorageUsage` rollback for `StorageAccount`. |

**Additional improvements not in original report:**
- Magic numbers (`10`, `1_073_741_824`) replaced with `DEFAULT_STORAGE_QUOTA_GB` / `BYTES_PER_GB` from `@/lib/upload/constants`
- `console.warn`/`console.error` in gallery photos route replaced with structured `logger.warn`/`logger.error`
- Storage account usage rollback added to catch block (`decreaseStorageUsage`)

---

## 🔴 Critical Issues (Fix Immediately)

### C1. `photoCount` Incorrectly Decremented During Cross-Gallery Deduplication

**File:** `src/app/api/admin/upload/complete/route.ts`  
**Lines:** ~244–258, ~377–389  
**Introduced by:** PR #97 (commit `61695e6`)

**Problem:**

During cross-gallery deduplication, `usedStorage` is correctly rolled back because the file already exists in R2. However, a **new `Photo` record is still created** in the database (line ~286). Despite this, `photoCount` is also decremented, causing the counter to become inaccurate.

```typescript
// ❌ WRONG — dedupRollback (line ~244)
const dedupRollback = await prisma.client.updateMany({
  where: { id: clientId, usedStorage: { gte: fileSizeBig } },
  data: {
    usedStorage: { decrement: fileSizeBig },
    photoCount: { decrement: 1 },  // ← WRONG: new Photo record IS created
  },
});

// ❌ WRONG — fallback update (line ~377)
await prisma.client.update({
  where: { id: clientId },
  data: {
    usedStorage: { decrement: fileSizeBig },
    photoCount: { decrement: 1 },  // ← WRONG
  },
});
```

**Impact:**
- `Client.photoCount` under-reports actual photo count after every cross-gallery deduplication
- Dashboard shows incorrect photo totals
- Data inconsistency accumulates over time

**Fix:**

```typescript
// ✅ CORRECT — only rollback usedStorage
const dedupRollback = await prisma.client.updateMany({
  where: { id: clientId, usedStorage: { gte: fileSizeBig } },
  data: {
    usedStorage: { decrement: fileSizeBig },
    // photoCount stays +1 because a new Photo record is created below
  },
});
```

Apply the same fix to the fallback `update` call and the error-rollback path (line ~418).

**Also note:** The same issue exists in the P2002 duplicate-handling path (lines ~433+), where `photoCount` is decremented during rollback even though the duplicate detection means no new Photo was created. In that path, decrementing `photoCount` IS correct because `prisma.photo.create` threw and no row was inserted. However, in the **dedup path** (lines ~244+), `prisma.photo.create` at line ~286 DOES succeed, so `photoCount` must NOT be decremented.

---

### C2. Direct Gallery Upload Route Bypasses Client Quota & photoCount

> **Status:** ✅ **Fixed** in `870e1be` + `0854148`

**File:** `src/app/api/admin/galleries/[id]/photos/route.ts`  
**Lines:** 236–250  
**Method:** `POST`

**Problem:**

This endpoint handles direct file uploads (multipart/form-data) to R2 + Cloudinary. It updates `StorageAccount.usedStorage` but **completely bypasses**:
1. Client storage quota checks (`Client.usedStorage` vs `Client.storageQuotaGB`)
2. Incrementing `Client.photoCount`
3. Incrementing `Client.usedStorage`

The newer presigned-upload flow (`/api/admin/upload/complete`) handles all of this correctly with atomic conditional updates.

**Impact:**
- Clients can exceed their storage quota via direct upload
- `Client.photoCount` and `Client.usedStorage` become stale
- Billing/quota enforcement is broken for this upload path

**Fix Applied:**

Atomic quota check using `updateMany` with `lte` guard, matching the presigned flow pattern. On failure, returns 413. On photo creation failure, rolls back both `Client.usedStorage` and `StorageAccount.usedStorage`. Magic numbers extracted to shared constants.

```typescript
// ✅ Implemented — see src/app/api/admin/galleries/[id]/photos/route.ts
const storageQuotaGB = gallery.event.client?.storageQuotaGB ?? DEFAULT_STORAGE_QUOTA_GB;
const storageQuotaBytes = BigInt(storageQuotaGB) * BigInt(BYTES_PER_GB);

const quotaUpdate = await prisma.client.updateMany({
  where: {
    id: clientId,
    usedStorage: { lte: storageQuotaBytes - fileSize },
  },
  data: {
    usedStorage: { increment: fileSize },
    photoCount: { increment: 1 },
  },
});

if (quotaUpdate.count === 0) {
  return errorResponse('Storage quota exceeded', 413);
}
```

Full upload flow now wrapped in try-catch with comprehensive rollback.

---

### C3. Webhook `fileSize` Precision Loss (`number` → `BigInt`)

> **Status:** ✅ **Fixed** in `870e1be`

**File:** `src/app/api/webhook/storage-deleted/route.ts`  
**Lines:** 46  
**Method:** `POST`

**Problem:**

The webhook receives `fileSize` as a JavaScript `number` via JSON payload, then converts it to `BigInt`:

```typescript
const DeletionCallbackSchema = z.object({
  fileSize: z.number().optional(),  // ← number has MAX_SAFE_INTEGER limit
});
// ...
await decreaseStorageUsage(storageAccountId, BigInt(fileSize));
```

If `fileSize` > `Number.MAX_SAFE_INTEGER` (9,007,199,254,740,991 bytes ≈ 9 PB), precision is lost during JSON parsing, leading to incorrect storage accounting.

**Fix Applied:**

Accepts `z.string().regex(/^\d+$/)` for new callers + `z.number()` for backward compatibility. `BigInt()` wrapped in try/catch to prevent unhandled parse errors. Number path guarded against `MAX_SAFE_INTEGER` overflow. `console.*` replaced with `logger.*`.

```typescript
// ✅ Implemented — see src/app/api/webhook/storage-deleted/route.ts
fileSize: z.union([
  z.string().regex(/^\d+$/, 'fileSize must be a numeric string'),
  z.number(),
]).optional(),
```

---

### C4. Portal Gallery Auth Too Strict — Breaks Public Share Flow

**File:** `src/app/api/portal/gallery/[token]/route.ts`  
**Lines:** 20–23  
**Method:** `GET`

**Problem:**

```typescript
const session = await getServerSession(authOptions);
if (!session || session.user.role !== 'CLIENT') {
  return unauthorizedResponse();
}
```

This endpoint is under `/api/portal/gallery/[token]` but requires an authenticated `CLIENT` session. Per `middleware.ts` (lines 18–24), public galleries should be **token-based and accessible without login**:

> *"Public gallery is token-based: anyone holding the clientToken in the URL must be able to view the gallery WITHOUT logging in."*

**Impact:**
- Public gallery share links will return 401/403 for unauthenticated users
- SEO/OG metadata server-rendering may fail
- Client sharing experience is broken

**Fix:**

Verify if there is a separate `/api/public/gallery/[token]` endpoint. If yes, this portal endpoint is intentionally for logged-in clients and may be correct. If no, add token-based auth (validate `clientToken` from URL params, not session).

**Note:** There IS a `src/app/api/public/gallery/[token]/route.ts` file. Verify that the public route handles unauthenticated access correctly and that this portal route is only used for the logged-in client dashboard view.

---

## 🟠 High Priority Issues

### H1. Missing Rate Limiting on 11 Admin Routes

**Risk:** DoS vulnerability, brute-force on data endpoints

The following routes call `getServerSession()` but do **NOT** call `checkRateLimit()`:

| # | Route File | Methods |
|---|-----------|---------|
| 1 | `src/app/api/admin/analytics/route.ts` | GET |
| 2 | `src/app/api/admin/clients/route.ts` | GET, POST |
| 3 | `src/app/api/admin/events/route.ts` | GET, POST, PATCH |
| 4 | `src/app/api/admin/failed-jobs/route.ts` | GET, DELETE |
| 5 | `src/app/api/admin/finance/route.ts` | GET |
| 6 | `src/app/api/admin/galleries/route.ts` | GET, POST |
| 7 | `src/app/api/admin/packages/route.ts` | GET, POST, PATCH, DELETE |
| 8 | `src/app/api/admin/settings/route.ts` | GET, POST |
| 9 | `src/app/api/admin/stats/route.ts` | GET |
| 10 | `src/app/api/admin/storage-accounts/route.ts` | GET, POST, PATCH, DELETE |
| 11 | `src/app/api/admin/storage-config/route.ts` | GET, PATCH |

**Currently rate-limited (good examples):**
- `upload/complete` — `RATE_LIMITS.UPLOAD_COMPLETE`
- `photos/bulk-delete` — `RATE_LIMITS.BULK_DELETE`
- `upload/presigned` — `RATE_LIMITS.UPLOAD_PRESIGNED`
- `search` — `RATE_LIMITS.SEARCH`
- `export/*` — `RATE_LIMITS.EXPORT`
- `public/booking` — `RATE_LIMITS.BOOKING`

**Recommended limits:**

```typescript
// Add to src/lib/rate-limit.ts
export const RATE_LIMITS = {
  // ... existing ...
  ADMIN_READ: { maxRequests: 60, windowMs: 60_000 },      // 60/min for list/fetch
  ADMIN_WRITE: { maxRequests: 30, windowMs: 60_000 },     // 30/min for create/update/delete
  STATS: { maxRequests: 30, windowMs: 60_000 },           // 30/min (cached anyway)
};
```

---

### H2. Inconsistent Zod Validation Patterns

**Problem:**

Two validation patterns coexist:

**Pattern A — `validateRequest()` helper (consistent, recommended):**
```typescript
import { validateRequest, idSchema } from '@/lib/api/validation';
const idValidation = validateRequest(idSchema, body);
if (!idValidation.success) return errorResponse(idValidation.error, 400);
```

**Pattern B — manual `safeParse()` (inconsistent, verbose):**
```typescript
const validation = someSchema.safeParse(body);
if (!validation.success) {
  const firstError = validation.error.errors[0];
  return errorResponse(`${firstError.path.join('.')}: ${firstError.message}`, 400);
}
```

Files using Pattern A (✅ good): `clients`, `packages`, `events`, `galleries/[id]`, `toggle-lock`, `galleries/bulk`, `photos/bulk`

Files using Pattern B (❌ inconsistent): `analytics`, `finance`, `settings`, `search`, `stats`, `storage-accounts`, `failed-jobs`

**Fix:** Migrate all routes to use `validateRequest()` for consistency. The helper centralizes error formatting and makes future changes easier.

---

### H3. `console.error` / `console.log` Used Instead of Structured Logger

> **Status:** 🟡 **Partial fix** in `0854148` — `gallery/[id]/photos` and `webhook/storage-deleted` migrated. 13+ routes remain.

```typescript
// ❌ Inconsistent — found in 15+ files
console.error('Error fetching analytics:', error);
console.error('[API] Error fetching galleries:', error);
console.warn('Could not get image dimensions:', dimError);
console.log(`[Webhook] ✅ Deletion confirmed for ${photoId}`);
```

**Files affected:** `analytics`, `events`, `galleries`, `finance`, `stats`, `packages`, `settings`, `galleries/[id]/photos`, `search`, `portal/gallery`, `webhook/storage-deleted`, etc.

**Fix:** Replace all `console.error`, `console.warn`, `console.log` with:

```typescript
import { logger } from '@/lib/logger';

logger.error('analytics.fetch_failed', { error: error instanceof Error ? error.message : String(error) });
logger.warn('upload.dimensions_failed', { uploadId, error: dimError });
logger.info('webhook.deletion_confirmed', { photoId, r2Deleted, cloudinaryDeleted });
```

---

### H4. Gallery Photos POST Not Wrapped in Transaction

> **Status:** ✅ **Addressed** in `0854148`

**File:** `src/app/api/admin/galleries/[id]/photos/route.ts`  
**Lines:** 230–250

**Problem:**

```typescript
await updateStorageUsage(primaryStorageAccountId, fileSize);  // Step 1
const photo = await prisma.photo.create({...});                // Step 2
```

If Step 1 succeeds and Step 2 fails (or vice versa), the database is left inconsistent. `StorageAccount.usedStorage` diverges from actual photo counts.

**Fix Applied:**

Entire upload flow (R2 upload, Cloudinary upload, storage usage increment, photo creation) is now wrapped in a single try block. If `prisma.photo.create` fails, both `Client.usedStorage` and `StorageAccount.usedStorage` are rolled back before rethrowing. This covers all failure modes without needing a Prisma `$transaction` (which is incompatible with the external R2/Cloudinary API calls).

---

### H5. Events POST: Retry Loop Without Exponential Backoff

**File:** `src/app/api/admin/events/route.ts`  
**Lines:** 96–127

**Problem:**

The retry loop for `kodeBooking` unique constraint collisions retries immediately up to 5 times with no delay:

```typescript
for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
  const kodeBooking = generateKodeBooking();
  try {
    event = await prisma.event.create({...});
    break;
  } catch (error) {
    if (error.code === 'P2002') {
      console.warn(`Kode booking collision (attempt ${attempt + 1}/${MAX_RETRIES}), retrying...`);
      lastError = error;
      continue; // ← immediate retry, no delay
    }
    throw error;
  }
}
```

Under high load (e.g., bulk import), concurrent requests can collide repeatedly, causing all retries to fail.

**Fix:**

Add minimal jitter/delay:

```typescript
if (error.code === 'P2002') {
  const delay = Math.min(100 * Math.pow(2, attempt), 1000); // 100ms, 200ms, 400ms, ...
  await new Promise(r => setTimeout(r, delay));
  continue;
}
```

Alternatively, use a UUIDv7 or nanoid for collision-resistant booking codes instead of random strings.

---

### H6. Stats & Finance Routes: `totalRevenue` Serialization Inconsistency

**File:** `src/app/api/admin/stats/route.ts:69`, `src/app/api/admin/finance/route.ts:96`

**Problem:**

```typescript
// stats/route.ts — converts to string
 totalRevenue: revenueResult._sum.totalPrice?.toString() ?? "0",

// finance/route.ts — keeps as number
 totalRevenue: totalAgg._sum.totalPrice || 0,
```

Both `totalPrice` fields are Prisma `Int?` (not BigInt), so `toString()` is unnecessary. However, the inconsistency may confuse frontend consumers.

**Fix:** Standardize on `number` for `Int` fields and `string` only for `BigInt` fields. Update `stats/route.ts` to return a number.

---

## 🟡 Medium Priority Issues

### M1. Analytics `totalViews` Returned as String

**File:** `src/app/api/admin/analytics/route.ts`  
**Line:** 89

```typescript
totalViews: (summaryData.summary._sum.viewCount || 0).toString(),
```

`viewCount` is `Int` in Prisma. Converting to string is inconsistent with the rest of the API where numeric counts are returned as numbers.

**Fix:** Return as number:
```typescript
totalViews: summaryData.summary._sum.viewCount || 0,
```

---

### M2. Search Endpoint: Unbounded Results per Entity

**File:** `src/app/api/admin/search/route.ts`  
**Lines:** 50–113

Each entity (galleries, events, clients) returns up to 10 results. With `type === 'all'`, the response can contain 30 items. This is acceptable but could be heavy for mobile clients.

**Suggestion:** Add a global `limit` parameter:
```typescript
const searchQuerySchema = z.object({
  q: z.string().min(2).max(200),
  type: z.enum(['all', 'galleries', 'events', 'clients']).default('all'),
  limit: z.coerce.number().int().min(1).max(20).default(10),
});
```

---

### M3. Settings Upsert Race Condition

**File:** `src/app/api/admin/settings/route.ts`  
**Lines:** 94–117

```typescript
const settings = await prisma.settings.upsert({
  where: { id: 'studio' },
  update: {...},
  create: {...},
});
```

Prisma `upsert` is atomic at the DB level, but if two requests arrive simultaneously when no row exists, both may attempt `create`, causing a unique constraint violation (P2002) on the second.

**Fix:** Wrap in try-catch for P2002 or use a transaction:
```typescript
try {
  const settings = await prisma.settings.upsert({...});
} catch (error) {
  if (isPrismaError(error, 'P2002')) {
    // Retry as pure update
    const settings = await prisma.settings.update({ where: { id: 'studio' }, data: {...} });
  }
}
```

---

### M4. Portal Gallery: `selectedPhotoIds` Query Could Be Inlined

**File:** `src/app/api/portal/gallery/[token]/route.ts`  
**Lines:** 79–83

```typescript
const selectedPhotoIds = latestSelection
  ? await prisma.photoSelection.findMany({
      where: { selectionId: latestSelection.id },
      select: { photoId: true },
    })
  : [];
```

This is already a single query (not N+1), but it could be fetched alongside the gallery using Prisma's nested `include` to reduce latency.

**Fix:**
```typescript
const gallery = await prisma.gallery.findUnique({
  where: { clientToken: token },
  include: {
    event: { include: { client: { select: safeClientSelect } } },
    selections: {
      orderBy: { submittedAt: 'desc' },
      take: 1,
      include: {
        photos: { select: { photoId: true } }, // if relation exists
      },
    },
  },
});
```

*(Note: Depends on Prisma schema relations.)*

---

### M5. Finance Route: Raw SQL for Revenue-by-Month

**File:** `src/app/api/admin/finance/route.ts`  
**Lines:** 72–81

```typescript
prisma.$queryRaw`
  SELECT 
    TO_CHAR("eventDate", 'YYYY Mon') as month,
    SUM("totalPrice") as revenue
  FROM "Event"
  WHERE "paymentStatus" = 'paid'
  GROUP BY TO_CHAR("eventDate", 'YYYY Mon'), DATE_TRUNC('month', "eventDate")
  ORDER BY DATE_TRUNC('month', "eventDate") DESC
  LIMIT 12
` as Promise<{ month: string; revenue: bigint }[]>,
```

**Pros:** Fast, done at DB level.  
**Cons:** Tight coupling to PostgreSQL (`TO_CHAR`, `DATE_TRUNC`, quoted identifiers). Not portable if migrating away from PostgreSQL.

**Recommendation:** Acceptable for now since TigerDB is PostgreSQL-compatible. Document the PostgreSQL dependency.

---

## 🟢 Low Priority Issues

### L1. Inconsistent Auth Check Patterns

**Three patterns observed:**

**Pattern A — Inline (analytics, finance, settings):**
```typescript
const session = await getServerSession(authOptions);
if (!session?.user) return errorResponse('Unauthorized', 401);
```

**Pattern B — Helper returning NextResponse | Session (galleries, packages, events):**
```typescript
async function checkAuth() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return unauthorizedResponse();
  return session;
}
// ...
const auth = await checkAuth();
if (auth instanceof NextResponse) return auth;
```

**Pattern C — Middleware + header injection (implicit):**
The middleware sets `x-user-email`, `x-user-id`, `x-user-role` headers, but no API route currently reads them.

**Recommendation:** Standardize on Pattern B (helper function) for all routes. Consider adding a shared `requireAuth()` utility in `@/lib/api/auth`.

---

### L2. Inconsistent Error Response Handling

**Three patterns:**

| Pattern | Used By | Notes |
|---------|---------|-------|
| `handlePrismaError(error)` | galleries, search | Centralized, catches P2025/P2002/P2003 |
| `serverErrorResponse('...')` | events, finance, stats, portal | Generic 500 |
| `errorResponse('...', 500)` | analytics, settings, webhook | Explicit status code |

**Recommendation:** Standardize on `handlePrismaError()` for all Prisma errors, and use `serverErrorResponse()` only for non-DB errors.

---

### L3. Reserved Word `package` as Object Key

**File:** `src/app/api/admin/packages/route.ts`  
**Line:** 83

```typescript
return successResponse({ package: pkg }, 201);
```

`package` is a reserved word in strict mode. While valid in modern JS as a property key, it can confuse tooling and is discouraged.

**Fix:**
```typescript
return successResponse({ pkg }, 201); // or { item: pkg }
```

*(Note: Check frontend consumers before changing the response key.)*

---

### L4. Intentional Fire-and-Forget Missing Comment

**File:** `src/app/api/admin/upload/complete/route.ts`  
**Line:** ~418

```typescript
cleanupUploadSession(uploadId).catch(() => {});
```

This is intentionally not awaited (fire-and-forget), but lacks a comment explaining why.

**Fix:**
```typescript
// Intentionally not awaited — session cleanup is best-effort and must not block response
void cleanupUploadSession(uploadId).catch(() => {});
```

---

## ✅ What's Working Well

| Pattern | Implementation | Files |
|---------|---------------|-------|
| **BigInt serialization** | `serializeBigInt()` helper + `.toString()` | `clients`, `upload/complete`, `photos`, `stats`, `portal/gallery` |
| **Zod validation** | Schema-first input validation | `upload/complete`, `search`, `analytics`, `settings`, `galleries/photos` |
| **Rate limiting** | `checkRateLimit()` per-endpoint | `upload/*`, `bulk-delete`, `search`, `export/*`, `booking` |
| **Atomic quota checks** | `updateMany` with `lte` guard | `upload/complete` ✅ |
| **Prisma error handling** | P2025 / P2002 / P2003 specific | `packages`, `events`, `galleries/bulk`, `photos/bulk-delete` |
| **Next.js 15 params** | `params: Promise<{...}>` | `galleries/[id]/photos`, `portal/gallery/[token]` |
| **Middleware auth** | JWT-based with role checks | `middleware.ts` — comprehensive |
| **Webhook auth** | `timingSafeEqual` constant-time compare | `webhook/storage-deleted` ✅ |
| **Cache layer** | `getCachedData()` with TTL | `stats`, `analytics` |

---

## 🎯 Recommended Action Plan

### Week 1 — Critical Fixes
- [ ] **C1:** Fix `photoCount` decrement in dedup paths (`upload/complete`)
- [x] **C2:** Add quota check + `photoCount` increment to gallery photos POST ✅ `870e1be` + `0854148`
- [x] **C3:** Change webhook `fileSize` to string type ✅ `870e1be`
- [ ] **C4:** Verify portal vs public gallery auth separation

### Week 2 — High Priority
- [ ] **H1:** Add rate limiting to 11 admin routes
- [ ] **H2:** Standardize all routes to use `validateRequest()` helper
- [x] **H3:** Replace `console.*` with structured `logger` (partial: `gallery/[id]/photos` + `webhook/storage-deleted`) ✅ `0854148` + `870e1be`
- [x] **H4:** Wrap gallery photos POST in transaction (addressed via try-catch rollback) ✅ `0854148`
- [ ] **H5:** Add exponential backoff to events retry loop
- [ ] **H6:** Standardize `totalRevenue` response type

### Week 3 — Medium Priority
- [ ] **M1:** Fix `totalViews` type in analytics
- [ ] **M2:** Add global limit to search endpoint
- [ ] **M3:** Handle P2002 in settings upsert
- [ ] **M4:** Inline `selectedPhotoIds` in portal gallery query
- [ ] **M5:** Document PostgreSQL dependency for raw SQL

### Week 4 — Low Priority / Polish
- [ ] **L1:** Create shared `requireAuth()` utility
- [ ] **L2:** Standardize error response patterns
- [ ] **L3:** Rename `package` key in response (if safe)
- [ ] **L4:** Add comments to fire-and-forget calls

---

## 📁 Files Referenced

### API Routes (34 files audited)
```
src/app/api/admin/analytics/route.ts
src/app/api/admin/clients/bulk/route.ts
src/app/api/admin/clients/quota/route.ts
src/app/api/admin/clients/route.ts
src/app/api/admin/events/[id]/route.ts
src/app/api/admin/events/bulk/route.ts
src/app/api/admin/events/route.ts
src/app/api/admin/export/clients/route.ts
src/app/api/admin/export/events/route.ts
src/app/api/admin/failed-jobs/route.ts
src/app/api/admin/finance/route.ts
src/app/api/admin/galleries/[id]/photos/[photoId]/download/route.ts
src/app/api/admin/galleries/[id]/photos/[photoId]/route.ts
src/app/api/admin/galleries/[id]/photos/bulk/route.ts
src/app/api/admin/galleries/[id]/photos/route.ts
src/app/api/admin/galleries/[id]/route.ts
src/app/api/admin/galleries/[id]/toggle-lock/route.ts
src/app/api/admin/galleries/bulk/route.ts
src/app/api/admin/galleries/route.ts
src/app/api/admin/packages/bulk/route.ts
src/app/api/admin/packages/route.ts
src/app/api/admin/photos/bulk-delete/route.ts
src/app/api/admin/search/route.ts
src/app/api/admin/settings/route.ts
src/app/api/admin/stats/route.ts
src/app/api/admin/storage-accounts/rotation/cron/route.ts
src/app/api/admin/storage-accounts/rotation/route.ts
src/app/api/admin/storage-accounts/route.ts
src/app/api/admin/storage-config/route.ts
src/app/api/admin/upload/cleanup/route.ts
src/app/api/admin/upload/complete/route.ts
src/app/api/admin/upload/presigned/batch/route.ts
src/app/api/admin/upload/presigned/route.ts
src/app/api/portal/gallery/[token]/route.ts
src/app/api/webhook/storage-deleted/route.ts
```

### Supporting Files
```
src/middleware.ts
src/lib/rate-limit.ts
src/lib/logger.ts
src/lib/api/validation.ts
src/lib/api/response.ts
src/lib/bigint-utils.ts
```

---

*Report generated by AI Code Review Agent. Validate all findings before implementation.*

---

### Fix History

| Date | Commit | Fix |
|------|--------|-----|
| 2026-05-22 | `870e1be` | **C2** — atomic quota check in gallery photos POST. **C3** — webhook `fileSize` as string, `logger.*` migration. |
| 2026-05-22 | `0854148` | **C2** — expanded rollback scope, added `StorageAccount` rollback, shared constants. **H3/H4** — console→logger, try block coverage. |*
