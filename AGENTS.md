# AGENTS.md — PhotoStudio SaaS

> ⚠️ Read this first before making any changes. This is the single source of truth for agents working on **hafiportrait-saas** (previously also maintained as `AGENT.md` — merged here, that file is gone).

---

## TL;DR

- **Stack**: Next.js 15.5.18, TypeScript strict, Tailwind v4, Prisma + Prisma Accelerate (Neon PostgreSQL), Cloudflare R2, Cloudinary, Ably
- **NOT standard Next.js**: Must await `params` and `searchParams` as Promise
- **Verify before commit**: `npm run lint && npm run build`
- **Styling**: Tailwind v4 OKLCH semantic only — NO static colors
- **Testing**: Playwright E2E with semantic locators only — NO CSS selectors, NO waitForTimeout
- **Zod**: ALL API inputs MUST be validated — use `formatZodError()` for error responses

---

## Dev Commands

```bash
npm run dev          # Dev server (port 3000)
npm run build        # Production build (lint + typecheck + build)
npm run lint         # ESLint only
npm run test:e2e     # Run E2E tests
npm run db:push      # Push Prisma schema to Neon (requires DIRECT_URL, NOT prisma://)
npm run db:generate  # Generate Prisma client
```

---

## Testing

### E2E Tests (Playwright)
```bash
npm run test:e2e          # Run all E2E tests
npm run test:e2e:ui       # Run with UI mode
npm run test:e2e:debug    # Debug mode
```

**Test Structure:**
- `tests/e2e/admin/` — Admin dashboard tests
- `tests/e2e/client-portal/` — Client portal tests
- `tests/e2e/public/` — Public gallery tests
- `tests/e2e/integration/` — Integration tests

**Best Practices:**
- Use semantic locators: `getByRole()`, `getByLabel()`, `getByText()`, `getByTestId()`
- NO CSS selectors or XPath
- NO `waitForTimeout()` — use Playwright auto-wait
- Use Page Object Model (POM) in `tests/e2e/pages/`
- Auth state cached in `playwright/.auth/`

**Test Constants:**
```typescript
import { HTTP_STATUS } from '@/tests/e2e/constants/http-status'
```

---

## Architecture

| Path | Purpose |
|------|---------|
| `src/app/(dashboard)/admin/` | Admin pages — auth required |
| `src/app/portal/` | Client portal (login + selection) |
| `src/app/gallery/[token]/` | Public gallery — token-based |
| `src/app/booking/` | Public booking form |
| `src/app/api/admin/` | Admin API routes (`requireAdminAuth`) |
| `src/app/api/portal/` | Portal API routes (`requireClientAuth`) |
| `src/app/api/public/` | Public API routes (no auth) |
| `src/app/api/webhook/` | Cloudflare Worker callbacks (HMAC signed) |
| `src/app/api/auth/[...nextauth]/` | NextAuth.js (dual providers) |
| `src/app/api/ably/token` | Ably token (public read) |
| `src/components/ui/` | shadcn/ui components |
| `src/lib/auth/` | Guards, helpers, constants |
| `src/lib/api/` | `response.ts`, `validation.ts`, `constants.ts` |
| `src/lib/storage/` | R2, Cloudinary, accounts |
| `src/lib/upload/` | Presigned URLs |
| `src/lib/db.ts` | Prisma client singleton |
| `src/lib/logger.ts` | Structured JSON logger |
| `src/lib/cloudflare-queue.ts` | Cloudflare Queues (via Worker HTTP) |
| `src/lib/bigint-utils.ts` | `serializeBigInt` |
| `src/lib/hooks/useAbly.ts` | Real-time hooks |
| `workers/` | Cloudflare Edge Workers |
| `prisma/schema.prisma` | Database schema (Neon PostgreSQL via Prisma Accelerate) |

---

## Database (Neon + Prisma Accelerate)

**Provider**: Neon PostgreSQL via Prisma Accelerate (connection pooling + edge cache)
**ORM**: Prisma
**Generated client**: `src/generated/prisma/`

### Database Operations
```bash
npm run db:push       # Push schema changes to Neon (requires DIRECT_URL, NOT prisma://)
npm run db:generate   # Generate Prisma client
```

### Query Database
Use **Tiger MCP** for direct database queries and inspection.

### Schema Changes
1. Edit `prisma/schema.prisma`
2. Run `npm run db:push`
3. Run `npm run db:generate`
4. Restart dev server

### Prisma Accelerate — TypeScript Pitfall
`withAccelerate()` changes the Prisma client type — TypeScript cannot infer callback types:
```typescript
// Transaction callbacks MUST be typed explicitly
import { Prisma } from '@/generated/prisma'
await prisma.$transaction(async (tx: Prisma.TransactionClient) => { ... })

// Catch parameters
try {
  // ...
} catch (e: unknown) {
  // ...
}

// Array callbacks — use explicit type annotation
const allActive = current.every((p: { isActive: boolean }) => p.isActive)
```

---

## Critical Rules

### Storage
- **Credentials from DB**: Cloudinary and R2 credentials from `StorageAccount` table — NOT `.env`

### BigInt
```typescript
// Prisma BigInt cannot JSON.stringify:
return successResponse({ fileSize: photo.fileSize?.toString() })
// Or use serializeBigInt() from '@/lib/bigint-utils'
```

### Background Jobs
- Use **Cloudflare Queues only** via `src/lib/cloudflare-queue.ts`
- Next.js POSTs to `CLOUDFLARE_WORKER_URL` — Worker handles queue publishing
- NO BullMQ, NO PM2, NO Redis for task queues

### API Response
```typescript
import { successResponse, errorResponse, paginatedResponse } from '@/lib/api/response'
```

### Pagination
```typescript
// Use paginationSchema from validation.ts
import { paginationSchema } from '@/lib/api/validation'
const result = paginationSchema.safeParse({
  page: searchParams.get('page') || undefined,
  limit: searchParams.get('limit') || undefined,
})
```

### Console vs Logger
- Server → `logger` (structured JSON from `src/lib/logger.ts`)
- Browser/Edge → `console.*` (by design)

---

## Code Style

- **TypeScript strict**: NO `any`, use `unknown` or specific interfaces
- **Imports**: Use `@/` alias for all `src/` imports
- **Notifications**: `toast()` from `sonner` — NEVER `alert()`
- **Dialog**: Import from `@/components/ui/dialog` — uses `@base-ui/react`, NOT Radix

---

## Zod Validation

ALL API inputs MUST be validated with Zod. Use `formatZodError()` for consistent error messages.

### Body Validation
```typescript
import { errorResponse } from '@/lib/api/response'
import { clientSchema, formatZodError } from '@/lib/api/validation'

const result = clientSchema.safeParse(body)
if (!result.success) return errorResponse(formatZodError(result.error), 400)
const data = result.data
```

### Route Params Validation
```typescript
import { errorResponse } from '@/lib/api/response'
import { tokenParamsSchema, formatZodError } from '@/lib/api/validation'

const rawParams = await params
const validated = tokenParamsSchema.safeParse(rawParams)
if (!validated.success) return errorResponse(formatZodError(validated.error), 400)
const { token } = validated.data
```

### Available Schemas
- `idSchema`, `paginationSchema`, `searchQuerySchema`
- `clientSchema`, `packageSchema`, `eventSchema`, `gallerySchema`
- `bookingSchema`, `selectionSubmitSchema`, `paymentProofSchema`
- `tokenParamsSchema`, `tokenPhotoParamsSchema`, `kodeBookingParamsSchema`
- `clientReconcileQuerySchema`

---

## UI Conventions — Aura Noir Theme

Use semantic OKLCH colors only:

```tsx
// Backgrounds & text
bg-background / bg-card / bg-card-hover
text-foreground / text-muted-foreground

// Actions
bg-primary / text-primary-foreground / hover:bg-primary/90

// Borders
border-border

// Native inputs MUST have explicit styling:
<input className="border border-border rounded-lg focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 bg-background text-foreground" />
```

**NEVER use**: static colors (`amber-500`, `gray-800`), `rgba(var(--primary))` syntax

---

## Storage Architecture

- **Cloudflare R2** — original files (direct upload via presigned URL)
- **Cloudinary** — thumbnails ONLY
- Credentials from `StorageAccount` table

**Direct Upload Flow:**
1. Client requests presigned URL from `/api/admin/upload/presigned`
2. Client uploads directly to R2
3. Client calls `/api/admin/upload/complete` → queues thumbnail generation

**Supported**: `.jpg`, `.jpeg`, `.png`, `.webp`, `.heic`, `.nef`, `.cr2`, `.arw`, `.dng`, `.raw`

---

## Security

- All `/api/admin/*` routes MUST use `requireAdminAuth()` from `@/lib/auth/require-admin-auth`
- Portal routes use `requireClientAuth()` from `@/lib/auth/require-client-auth`
- Webhooks MUST validate `VPS_WEBHOOK_SECRET` header
- NEVER commit secrets, tokens, credentials
- Validate ALL inputs with **Zod** + `formatZodError()`
- Handle Prisma `P2025` → return 404

```typescript
// Admin route auth pattern
import { NextResponse } from 'next/server'
import { requireAdminAuth } from '@/lib/auth/require-admin-auth'
const auth = await requireAdminAuth()
if (auth instanceof NextResponse) return auth
```

---

## Auth System

Two separate login flows, each with its own JWT:
- **Admin**: `/login` → CredentialsProvider(id: admin) → `role: "admin"`
- **Client**: `/portal/login` → CredentialsProvider(id: client) → `role: "client"`

Sessions use the same cookie name → conflict when both are open in different tabs. Middleware detects the mismatch → redirects to login with `?error=SessionConflicts`.

---

## Database Models

- **User** — Admin accounts
- **Client** — nama, email, isApproved, storageQuotaGB, usedStorage
- **Event** — kodeBooking, clientId, packageId, status, totalPrice, paymentStatus
- **Package** — nama, price, maxSelection, maxDownload
- **Payment** — eventId, amount, type(dp/full), proofUrl, status
- **Gallery** — eventId (unique!), namaProject, clientToken, maxSelection, enableDownload
- **Photo** — galleryId, url, thumbnailUrl, r2Key, fileSize, order
- **Selection** — galleryId, submittedAt
- **StorageAccount** — provider(R2/CLOUDINARY), credentials, usedStorage

---

## Key API Routes

| Route | Method | Auth | Purpose |
|---|---|---|---|
| `/api/admin/payments/[id]` | PATCH | admin | Approve/reject payment + auto-create gallery |
| `/api/admin/galleries/[id]/photos` | GET | admin | List photos with pagination |
| `/api/admin/upload/presigned` | POST | admin | Get R2 presigned URL |
| `/api/admin/upload/complete` | POST | admin | Confirm upload → queue thumbnail |
| `/api/public/payment/create` | POST | public | Create payment (DP/full) |
| `/api/webhook/thumbnail-generated` | POST | HMAC | Worker callback after thumbnail done |
| `/api/ably/token` | GET | public | Ably auth token for real-time |

---

## Key Fixes History

| PR | What |
|---|---|
| #167 | Gallery crash — PrismaClient bundled to browser via PhotoImage → cloudinary. Fix: dynamic import |
| #168 | Mobile UI — filter buttons wrap, gallery header text overlap |
| #169 | Auto-gallery on payment approval + session conflict fix + logo validation + DB `@@unique([eventId])` |

---

## Known Limitations

- Thumbnail generation depends on Cloudinary credentials in `StorageAccount` table
- `VPS_WEBHOOK_SECRET` must match between Worker (wrangler secret) and Vercel env
- Session conflict still possible between admin/client tabs (mitigated by middleware redirect)
- DP → Pelunasan flow implemented but remaining balance calculation is implicit (total - paidAmount)

---

## Autonomous Mode

| Cron | What |
|---|---|
| Daily 09:00 UTC | git pull → npm audit → build → fix minor → PR → merge auto |
| Weekly Mon 10:00 | Full codebase scan (security, Prisma, types, deps) → report |

---

## PR Workflow

```
Branch → Commit/Push → PR → WAIT 3-5min for auto-review
  → Read ALL bots (Sourcery, Gemini, Gitar, Seer, CodeAnt, Vercel)
  → Fix ALL issues → Commit/Push
  → Manual re-review (@sourcery-ai, /gemini) ONLY after fixes
  → Vercel ✅ + all bots ✅ → ASK user → Merge
  NEVER push to main. NEVER merge with unresolved issues.
```

---

## Project Skills (project-scoped)

Skills are kept **inside this repo** so they never leak across projects:

- `.opencode/skills/` — opencode skills used by this project (review workflow: check-pr-comments, cubic-loop, codebase-context, review-patterns, run-review, open-code-review-delegate; stack: cloudflare, using-ably, debugging-with-ably-cli, github-pr-workflow, github-code-review)
- `.agents/skills/` — shared skill library for this project (Next.js, Tailwind, Playwright, Zod, shadcn, SEO, etc.), symlinked from `.claude/skills/` and `.junie/skills/`

Do NOT add project-specific skills to global skill directories (`~/.config/opencode/skills/`, `~/.agents/skills/`) — keep them in `.opencode/skills/` and reference them from here.

---

## Explicit Prohibitions

1. **NO `alert()`** — use `sonner toast()` only
2. **NO static Tailwind colors** — use OKLCH semantic tokens
3. **NO unbounded queries** — always paginate
4. **NO CSS selectors in tests** — use semantic locators only
5. **NO `waitForTimeout()` in tests** — use Playwright auto-wait
6. **NO magic numbers** — use named constants from `@/lib/api/constants`
7. **NO `any` type** — use `unknown` or specific interfaces
8. **NO direct storage credentials in `.env`** — use `StorageAccount` table

---

## MCP Tools

| Task | MCP |
|------|-----|
| Browser testing | Playwright MCP |
| DOM inspection | Chrome DevTools MCP |
| PR/GitHub | GitHub MCP |
| Docs lookup | Context7 MCP |
| shadcn/ui | shadcn MCP |
| File ops | Filesystem MCP |
| Database queries | Tiger MCP |

---

## Environment Variables

```env
DATABASE_URL=prisma+postgres://accelerate.prisma-data.net/?api_key=...
# DIRECT_URL untuk db:push saja (DDL tidak support via prisma://)
DIRECT_URL=postgresql://...
CLOUDFLARE_WORKER_URL=https://...
ABLY_API_KEY=...
NEXTAUTH_SECRET=...
VPS_WEBHOOK_SECRET=...
# Untuk preview URL testing dengan Kernel
VERCEL_AUTOMATION_BYPASS_SECRET=...
```

---

## Pattern Learning

After completing a task successfully:

1. Note what worked in a comment
2. For reusable patterns, add a skill to `.opencode/skills/` (project-scoped) — NOT global
3. Reference past tasks via session search
