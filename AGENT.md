# AGENT.md — PhotoStudio SaaS

> Read this first. Everything AI agent needs to work on this project.

## Quick Summary

Next.js 15.5.18 SaaS for photographers. Admin manages clients/galleries/uploads. Client portal for selection/payment. Public gallery by token. Real-time via Ably. Background jobs via Cloudflare Queues.

## Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 15.5.18 App Router |
| Language | TypeScript strict — NO `any` |
| Styling | Tailwind v4 OKLCH — NO static colors |
| Database | Neon PostgreSQL via Prisma Accelerate |
| ORM | Prisma 5.22.0 (client: `src/generated/prisma/`) |
| Auth | NextAuth.js v4 — dual providers (admin + client) |
| Storage | Cloudflare R2 (originals) + Cloudinary (thumbnails) |
| Real-time | Ably |
| Validation | Zod — ALL API inputs |
| Testing | Playwright E2E — semantic locators only |
| Queue | Cloudflare Queues via Worker HTTP |

## Commands

```bash
npm run dev              # Dev server
npm run build            # Production build (lint + tsc + build)
npm run lint             # ESLint
npm run db:push          # Push schema (requires DIRECT_URL)
npm run db:generate      # Prisma generate
npm run test:e2e         # Playwright E2E
```

## Directory Structure

```
src/
  app/
    (dashboard)/admin/       Admin pages — auth required
    portal/                  Client portal
    gallery/[token]/         Public gallery by token
    booking/                 Public booking form
    api/
      admin/*                Admin API (requireAdminAuth)
      portal/*               Portal API (requireClientAuth)
      public/*               Public API (no auth)
      webhook/*              Worker callbacks (HMAC signed)
      auth/[...nextauth]/    NextAuth.js
      ably/token             Ably token (public read)
  lib/
    auth/                    Guards, helpers, constants
    api/
      response.ts            successResponse, errorResponse, etc.
      validation.ts          Zod schemas + formatZodError
      constants.ts           HTTP status, limits
    storage/                 R2, Cloudinary
    upload/                  Presigned URLs
    db.ts                    Prisma client singleton
    logger.ts                Structured JSON logger
    cloudflare-queue.ts      Queue publisher
    bigint-utils.ts          serializeBigInt
    hooks/useAbly.ts         Real-time hooks
  components/ui/             shadcn/ui (30+ components)
workers/                     Cloudflare Worker
prisma/schema.prisma         DB schema
```

## Critical Rules

1. **Auth**: ALL `/api/admin/*` → `requireAdminAuth()`. ALL `/api/portal/*` → `requireClientAuth()`
2. **Validation**: ALL inputs → Zod + `formatZodError()`. Route params must `await params` (Next.js 15)
3. **BigInt**: Prisma BigInt cannot `JSON.stringify`. Use `successResponse()` or `serializeBigInt()`
4. **Storage creds**: From `StorageAccount` table, NOT `.env` (multi-account support)
5. **Colors**: Tailwind v4 semantic OKLCH only (`bg-background`, `text-foreground`, `border-border`). NEVER `amber-500`, `gray-800`
6. **Console vs Logger**: Server → `logger`. Browser/Edge → `console.*` (by design)
7. **Background jobs**: Cloudflare Queues only. NO BullMQ, NO Redis, NO PM2
8. **Paginate**: Always `take`/`skip` on queries
9. **No `any`**: Use `unknown` or specific interfaces
10. **No `alert()`**: Use `toast()` from sonner

## PR Workflow

```
Branch → Commit/Push → PR → WAIT 3-5min for auto-review
  → Read ALL bots (Sourcery, Gemini, Gitar, Seer, CodeAnt, Vercel)
  → Fix ALL issues → Commit/Push
  → Manual re-review (@sourcery-ai, /gemini) ONLY after fixes
  → Vercel ✅ + all bots ✅ → ASK user → Merge
  NEVER push to main. NEVER merge with unresolved issues.
```

## Auth System

Two separate login flows, each with its own JWT:
- **Admin**: `/login` → CredentialsProvider(id: admin) → `role: "admin"`
- **Client**: `/portal/login` → CredentialsProvider(id: client) → `role: "client"`

Sessions use same cookie name → conflict when both open in different tabs. Middleware detects mismatch → redirect to login with `?error=SessionConflicts`.

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

## Key Fixes History

| PR | What |
|---|---|
| #167 | Gallery crash — PrismaClient bundled to browser via PhotoImage → cloudinary. Fix: dynamic import |
| #168 | Mobile UI — filter buttons wrap, gallery header text overlap |
| #169 | Auto-gallery on payment approval + session conflict + logo validation + DB `@@unique([eventId])` |

## Autonomous Mode

| Cron | What |
|---|---|
| Daily 09:00 UTC | git pull → npm audit → build → fix minor → PR → merge auto |
| Weekly Mon 10:00 | Full codebase scan (security, Prisma, types, deps) → report |

## Known Limitations

- Thumbnail generation depends on Cloudinary credentials in `StorageAccount` table
- VPS_WEBHOOK_SECRET must match between Worker (wrangler secret) and Vercel env
- Session conflict still possible between admin/client tabs (mitigated by middleware redirect)
- DP → Pelunasan flow implemented but remaining balance calculation is implicit (total - paidAmount)
