# AGENTS.md — PhotoStudio SaaS

> ⚠️ Read this first before making any changes.

---

## TL;DR

- **Stack**: Next.js 15.4.11, TypeScript strict, Tailwind v4, Prisma + TigerDB, Cloudflare R2, Cloudinary, Ably
- **NOT standard Next.js**: Must await `params` and `searchParams` as Promise
- **Verify before commit**: `npm run lint && npm run build && npm run test:e2e`
- **Styling**: Tailwind v4 OKLCH semantic only — NO static colors
- **Testing**: Playwright E2E with semantic locators only — NO CSS selectors, NO waitForTimeout

---

## Dev Commands

```bash
npm run dev          # Dev server (port 3000)
npm run build       # Production build (lint + typecheck + build)
npm run lint       # ESLint only
npm run test:e2e    # Run E2E tests
npm run db:push    # Push Prisma schema to TigerDB
npm run db:generate # Generate Prisma client
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
| `src/lib/cloudflare-queue.ts` | Cloudflare Queues |
| `workers/` | Cloudflare Edge Workers |
| `prisma/schema.prisma` | Database schema (TigerDB) |

**Database**: TigerDB (PostgreSQL-compatible) via Prisma

---

## Database (TigerDB)

**Provider**: TigerDB (PostgreSQL-compatible)  
**ORM**: Prisma

### Database Operations
```bash
npm run db:push       # Push schema changes to TigerDB
npm run db:generate   # Generate Prisma client
```

### Query Database
Use **Tiger MCP** for direct database queries and inspection:
- Check database schema
- Query tables directly
- Inspect data

### Schema Changes
1. Edit `prisma/schema.prisma`
2. Run `npm run db:push`
3. Run `npm run db:generate`
4. Restart dev server

---

## Critical Rules

### Storage
- **Credentials from DB**: Cloudinary and R2 credentials from `StorageAccount` table — NOT `.env`

### BigInt
```typescript
// Prisma BigInt cannot JSON.stringify:
return successResponse({ fileSize: photo.fileSize?.toString() })
```

### Background Jobs
- Use **Cloudflare Queues only** — NO BullMQ, NO PM2, NO Redis

### API Response
```typescript
import { successResponse, errorResponse, paginatedResponse } from '@/lib/api/response'
```

### Pagination
```typescript
const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
const limit = Math.min(100, parseInt(searchParams.get('limit') ?? '20', 10))
```

---

## Code Style

- **TypeScript strict**: NO `any`, use `unknown` or specific interfaces
- **Imports**: Use `@/` alias for all `src/` imports
- **Notifications**: `toast()` from `sonner` — NEVER `alert()`
- **Dialog**: Import from `@/components/ui/dialog'` — uses `@base-ui/react`, NOT Radix

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

- All `/api/admin/*` routes MUST call `getServerSession()` at the top
- Webhooks MUST validate `VPS_WEBHOOK_SECRET` header
- NEVER commit secrets, tokens, credentials
- Validate inputs with **Zod**
- Handle Prisma `P2025` → return 404

---

## Explicit Prohibitions

1. **NO bash for file operations** — use Filesystem MCP tools
2. **NO custom test scripts** — use Playwright MCP
3. **NO `alert()`** — use `sonner toast()` only
4. **NO static Tailwind colors** — use OKLCH semantic tokens
5. **NO unbounded queries** — always paginate
6. **NO CSS selectors in tests** — use semantic locators only
7. **NO `waitForTimeout()` in tests** — use Playwright auto-wait
8. **NO magic numbers** — use named constants

---

## Multi-Agent System

This project uses **either** Kiro CLI **or** Claude Code — not both simultaneously.

### Using Kiro CLI

```bash
kiro-cli chat
# Define agents in ./.kiro/agents/
```

### Using Claude Code

```bash
claude
# Agents defined via CLAUDE.md
```

### Manual Agent Invocation

```
@frontend Build login page
@backend Create auth API
@reviewer Review code
@devops Deploy to staging
```

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

## Pattern Learning

After completing a task successfully:

1. Note what worked in a comment
2. For reusable patterns, create a skill in `.kiro/skills/` or `.claude/skills/`
3. Reference past tasks in `TASK-BOARD.md`

---

## Environment Variables

```env
DATABASE_URL=postgresql://...
CLOUDFLARE_API_TOKEN=...
ABLY_API_KEY=...
NEXTAUTH_SECRET=...
VPS_WEBHOOK_SECRET=...
```

---

## Kiro Configuration (Optional)

Project-specific rules in `.kiro/steering/`:

| File | Content |
|------|---------|
| `product.md` | Product overview |
| `tech.md` | Stack details |
| `structure.md` | Directory layout |
| `security.md` | Auth rules |

---

## Verification Before Commit

```bash
npm run lint && npm run build && npm run test:e2e
```