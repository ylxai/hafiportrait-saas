# Historical Errors & Lessons Learned

## CODEBASE AUDIT FINDINGS (April 2026)

### High Priority Issues

#### 1. Button Component - Legacy Colors
**File:** `src/components/ui/button.tsx`
- **Issue:** Menggunakan static Tailwind colors (amber-500, slate-300, slate-100) yang tidak konsisten dengan Aura Noir OKLCH theme
- **Fix:** Gunakan semantic tokens: `bg-primary`, `text-primary-foreground`, `border-border`
- **Impact:** Theme inconsistency, dark mode issues

#### 2. API Response Pattern Inconsistency
**File:** `src/app/api/admin/stats/route.ts` (Line 10)
- **Issue:** Menggunakan `Response.json()` langsung bukan helper functions
- **Fix:** Gunakan `errorResponse()` dan `successResponse()` dari `@/lib/api/response`
- **Impact:** Response format tidak konsisten dengan API lain

#### 3. Data Access Pattern Inconsistency
**Files:** `src/app/(dashboard)/admin/events/page.tsx` vs `clients/page.tsx`
- **Issue:** Events page benar (data?.data?.events), Clients page langsung akses data.clients
- **Fix:** Semua page harus konsisten menggunakan successResponse wrapper pattern
- **Impact:** Frontend bug potential

#### 4. Missing BigInt Serialization
**File:** `src/app/api/admin/stats/route.ts`
- **Issue:** Tidak ada .toString() conversion untuk BigInt fields
- **Fix:** Selalu convert BigInt ke string sebelum JSON response
- **Impact:** TypeError saat serialization

### Medium Priority Issues

#### 5. Middleware Coverage
**File:** `src/middleware.ts`
- **Issue:** Matcher hanya ['/admin/:path*', '/login'], tidak include /api/admin/*
- **Fix:** Tambahkan pattern untuk /api/admin/* atau implement per-route auth checks

#### 6. TypeScript Target
**File:** `tsconfig.json`
- **Issue:** Target ES2017 terlalu lama
- **Fix:** Upgrade ke ES2022

#### 7. Unused Dependencies
**File:** `package.json`
- **Issue:** ioredis masih ada padahal sudah migrate ke Cloudflare Queues
- **Fix:** Remove ioredis dari dependencies

#### 8. Unused Import
**File:** `src/lib/cloudflare-queue.ts` (Line 5)
- **Issue:** Import Prisma yang tidak digunakan
- **Fix:** Remove unused import

#### 9. Missing Pagination in Clients Page
**File:** `src/app/(dashboard)/admin/clients/page.tsx`
- **Issue:** API support pagination tapi UI tidak implementasikan
- **Fix:** Tambahkan pagination state seperti di Events page

#### 10. Rate Limiting
- **Issue:** Tidak ada rate limiting untuk API routes
- **Fix:** Implement rate limiting middleware untuk upload dan webhook endpoints

### Low Priority Issues

#### 11. Cloudflare Worker Types
**File:** `workers/deletion-worker.ts`
- **Issue:** Tipe R2Bucket dan MessageBatch tanpa import eksplisit
- **Fix:** Add proper type imports atau type definitions

#### 12. Console Logs in Production
- **Issue:** Banyak console.log di API routes
- **Fix:** Ganti dengan structured logging system

#### 13. ESLint Suppression
**File:** `src/app/(dashboard)/admin/events/page.tsx`
- **Issue:** react-hooks/exhaustive-deps suppression
- **Fix:** Perbaiki dependency array secara proper

#### 14. Dashboard Hardcoded Colors
**File:** `src/app/(dashboard)/admin/page.tsx`
- **Issue:** Menggunakan amber-500 dan warna statis lainnya
- **Fix:** Gunakan OKLCH semantic colors

---

## Original Historical Errors

## 1. Tool Usage & MCP
- **Error**: Agent using bash `cat`, `ls`, or writing custom Node.js/Python scripts (`test.js`, `get_logs.js`) to view files or interact with the browser.
- **Fix/Rule**: **ALWAYS** use built-in MCP tools (Filesystem MCP, Playwright MCP, Chrome DevTools MCP, GitHub MCP, Context7 MCP). Never write temporary scripts to test the UI or API when Playwright MCP is available for interactive sessions.

## 2. Next.js 15 App Router
- **Error**: Using synchronous `params` or `searchParams` in API routes or pages, causing build and runtime errors.
- **Fix/Rule**: In Next.js 15.4.11, `params` and `searchParams` are asynchronous. They **MUST** be awaited as a `Promise` (e.g., `const { id } = await params;`).

## 3. Database & BigInt
- **Error**: Returning `BigInt` directly in JSON API responses or sending it to Cloudflare Queues, causing `TypeError: Do not know how to serialize a BigInt`.
- **Fix/Rule**: Always convert BigInt to string using `.toString()` before serialization (e.g., `fileSize: photo.fileSize.toString()`).

## 4. CSS & Tailwind v4
- **Error**: Using legacy `rgba(var(--primary), 0.5)` syntax for box-shadows which breaks in Tailwind v4.
- **Fix/Rule**: Use direct RGB values (e.g., `rgb(224, 155, 61)`) or valid OKLCH tokens for shadows in Tailwind v4. Do not use legacy color classes (`text-amber-700`, `border-champagne-100`).

## 5. Memory Overflows
- **Error**: Fetching tens of thousands of rows at once in Prisma (e.g., `include: { photos: true }` on a gallery with 10k photos), causing Out-Of-Memory (OOM) on serverless environments.
- **Fix/Rule**: Always use **Server-Side Pagination** with cursors or `take`/`skip` for large datasets. Add `select` clauses in background jobs to fetch only required columns.

## 6. API Response Wrapper (`successResponse`)
- **Error**: UI client fails to render data (blank screen) because it tries to access `data.events` directly.
- **Fix/Rule**: All API endpoints use the `successResponse` wrapper, returning `{ data: { ... } }`. When using `useSWR`, ALWAYS access data inside the nested object: `data?.data?.events` or `data?.data?.gallery`.

## 7. Zod Env Validation on Client-Side
- **Error**: Public page crashes with "Invalid environment configuration" because Zod validation tries to read server-only variables (like `DATABASE_URL`) on the client-side.
- **Fix/Rule**: Bypass client-side validation for non-`NEXT_PUBLIC_` variables in `src/lib/env.ts`.

## 8. Cloudflare R2 Direct Upload & CORS
- **Error**: Photo uploads fail with 400 Bad Request or get blocked by the client's browser.
- **Fix/Rule**: Clients upload directly to R2 presigned URLs. If this fails, the FIRST thing to check is the bucket's CORS configuration (it must allow PUT methods and the correct Allowed Origins).