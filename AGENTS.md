# AGENTS.md — PhotoStudio SaaS

> ⚠️ Read this first before making any changes.

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
| `src/app/gallery/[token]/` | Public gallery — token-based |
| `src/app/api/admin/` | Admin API routes |
| `src/app/api/public/` | Public API routes |
| `src/app/api/webhook/` | Cloudflare Worker webhooks |
| `src/components/ui/` | shadcn/ui components |
| `src/lib/storage/` | R2, Cloudinary, accounts |
| `src/lib/upload/` | Presigned URLs |
| `src/lib/cloudflare-queue.ts` | Cloudflare Queues (via Worker HTTP) |
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
import { tokenParamsSchema, tokenPhotoParamsSchema, formatZodError } from '@/lib/api/validation'

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

## Explicit Prohibitions

1. **NO `alert()`** — use `sonner toast()` only
2. **NO static Tailwind colors** — use OKLCH semantic tokens
3. **NO unbounded queries** — always paginate
4. **NO CSS selectors in tests** — use semantic locators only
5. **NO `waitForTimeout()` in tests** — use Playwright auto-wait
6. **NO magic numbers** — use named constants from `@/lib/api/constants`
7. **NO `any` type** — use `unknown` or specific interfaces
8. **NO direct DB credentials in `.env`** — use `StorageAccount` table

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
DIRECT_URL=postgresql://...  # For db:push only (DDL not supported via prisma://)
CLOUDFLARE_WORKER_URL=https://...
ABLY_API_KEY=...
NEXTAUTH_SECRET=...
VPS_WEBHOOK_SECRET=...
VERCEL_AUTOMATION_BYPASS_SECRET=...  # For preview URL testing
```

---

## Pattern Learning

After completing a task successfully:

1. Note what worked in a comment
2. For reusable patterns, save as a Hermes skill via `skill_manage`
3. Reference past tasks via session search
