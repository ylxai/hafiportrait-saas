# PhotoStudio SaaS — Project Core

> Single source of truth for all AI agents working on this project.
> Read this first. Trust these docs over assumptions.

## 1. Project Identity

| Field | Value |
|---|---|
| **Name** | PhotoStudio SaaS |
| **Repository** | `ylxai/hafiportrait-saas` |
| **Deployment** | Vercel (sin1 - Singapore) |
| **Production URL** | https://studio.hafiportrait.photography |
| **Project ID** | prj_VoHbI9F4ZPQYDgE4RorWe91QgCe1 |
| **Node Version** | v25.x (via .nvm) |

---

## 2. Tech Stack

| Layer | Technology | Version | Notes |
|---|---|---|---|
| Framework | Next.js | 15.5.18 | App Router, NOT standard Next.js (see §4) |
| Language | TypeScript | strict | NO `any` anywhere in `src/app/` |
| Styling | Tailwind CSS | v4 | OKLCH semantic tokens ONLY (no static colors) |
| Database | Neon PostgreSQL | — | Via Prisma Accelerate (connection pooling + edge cache) |
| ORM | Prisma | 5.22.0 | Client generated at `src/generated/prisma/` |
| Cloud Storage | Cloudflare R2 | — | Original files (presigned URL direct upload) |
| Thumbnails | Cloudinary | — | Thumbnails ONLY |
| Real-time | Ably | 2.21.0 | Pub/sub for gallery updates |
| Auth | NextAuth.js | 4.24.13 | CredentialsProvider for both admin & client |
| Validation | Zod | 3.24.1 | ALL API inputs MUST be validated |
| Testing | Playwright | 1.59.1 | E2E semantic locators only |
| Background Jobs | Cloudflare Queues | — | Via Worker HTTP (NOT Redis/BullMQ) |

**Critical Prisma Notes:**
- `DATABASE_URL` uses Prisma Accelerate `prisma+postgres://` (NOT raw PostgreSQL)
- Schema migrations require `DIRECT_URL` (raw Neon connection string)
- `withAccelerate()` changes Prisma client type — transaction callbacks MUST be typed: `async (tx: Prisma.TransactionClient) => {}`

---

## 3. Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        Vercel (Edge/Node)                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │ Admin Pages   │  │ Client Portal│  │ Public Gallery  │  │
│  │ (dashboard)   │  │  (portal)    │  │   (gallery)      │  │
│  └──────┬────────┘  └──────┬───────┘  └──────┬──────────┘  │
│         │                  │                  │             │
│  ┌──────▼──────────────────▼──────────────────▼──────────┐  │
│  │              API Routes (Next.js App Router)          │  │
│  │  /api/admin/*  │  /api/portal/*  │  /api/public/*     │  │
│  │  /api/webhook/*  │  /api/auth/*                       │  │
│  └──────┬──────────────────┬───────────────┬─────────────┘  │
│         │                  │               │               │
│  ┌──────▼──────┐  ┌──────▼──────┐  ┌────▼────────────┐  │
│  │  Prisma     │  │ Cloudflare  │  │    Ably         │  │
│  │  +Accelerate│  │ R2 / Worker │  │  (real-time)    │  │
│  └──────┬──────┘  └─────────────┘  └─────────────────┘  │
│         │                                                  │
│  ┌──────▼────────────────────────────────────────────────┐│
│  │               Neon PostgreSQL                          ││
│  └────────────────────────────────────────────────────────┘│
└────────────────────────────────────────────────────────────┘
```

---

## 4. File Structure (Key Paths)

```
prisma/                          # Database schema
  schema.prisma

src/
  app/
    (dashboard)/                 # Admin dashboard group (auth wall from middleware)
      admin/
        clients/                 # Client CRUD
        events/                  # Event CRUD + bulk
        galleries/               # Gallery CRUD + detail + photos + uploads
        packages/                # Service packages
        payments/                # Payment management
        analytics/               # Dashboard stats
        finance/                 # Financial reports
        storage/                 # Storage accounts config
        settings/                # Global settings
        
    (public)/                    # Public-facing pages (no auth)
      gallery/[token]/           # Public gallery (token-based)
      booking/                   # Public booking form
      login/                     # Admin login
      
    portal/                      # Client portal (auth wall)
      login/                     # Client login
      dashboard/
      invoices/
      profile/
      
    api/
      admin/                     # Admin API (requireAdminAuth)
      portal/                    # Portal API (requireClientAuth)
      public/                    # Public API (no auth)
      webhook/                   # Cloudflare Worker webhooks
      auth/[...nextauth]/        # NextAuth.js routes
      ably/token                  # Ably token endpoint (public read)

  components/
    ui/                          # shadcn/ui components (30+)
    photo/                       # PhotoImage, Lightbox, UploadManager
    
  lib/
    api/                         # response, validation, constants
    auth/                        # NextAuth options, role helpers, guards
    db.ts                        # Prisma client singleton
    logger.ts                    # Structured JSON logger
    storage/                     # R2, Cloudinary, account management
    upload/                      # Presigned URLs, hash, analytics
    cloudflare-queue.ts          # Queue publisher (Cloudflare Worker)
    bigint-utils.ts              # serializeBigInt for JSON serialization
    hooks/                       # useAbly, custom React hooks
    
  generated/prisma/              # Generated Prisma client (DO NOT EDIT)

tests/
  e2e/                         # Playwright E2E tests
    admin/                       # Admin dashboard tests
    client-portal/               # Client portal tests
    public/                      # Public gallery tests
    integration/                 # Cross-module integration tests
    pages/                       # Page Object Model
    constants/                   # Shared constants
```

---

## 5. Edge vs Node Runtime

- **Middleware** (`src/middleware.ts`): Runs in **Edge runtime** (no `node:async_hooks`)
- **API Routes**: Run in **Node.js runtime** (full Prisma + async_hooks available)
- **`src/lib/logger.ts`**: Guards `node:async_hooks` import — falls back to no requestId in Edge
- **`src/lib/cloudinary.ts`**, **`src/lib/storage/accounts.ts`**: **Browser context** — cannot use `node:async_hooks`, use `console.*` (by design, NOT a bug)
- **`src/app/api/*` routes**: Always server-side — use `logger` from `@/lib/logger`
