# AGENTS.md — PhotoStudio SaaS

> ⚠️ Read this first before making any changes.

---

## TL;DR

- **Stack**: Next.js 15.4.11, TypeScript strict, Tailwind v4, Prisma + PostgreSQL, Cloudflare R2, Cloudinary, Ably
- **NOT standard Next.js**: Must await `params` and `searchParams` as Promise
- **Verify before commit**: `npm run lint && npm run build`
- **Styling**: Tailwind v4 OKLCH semantic only — NO static colors

---

## Dev Commands

```bash
npm run dev          # Dev server (port 3000)
npm run build       # Production build (lint + typecheck + build)
npm run lint       # ESLint only
npm run db:push    # Push Prisma schema to DB
npm run db:generate
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
| `prisma/schema.prisma` | Database schema |

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
npm run lint && npm run build
```