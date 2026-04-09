# Historical Errors & Lessons Learned

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