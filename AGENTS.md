# AGENTS.md — PhotoStudio SaaS

## Project Overview

PhotoStudio SaaS — platform manajemen foto profesional untuk fotografer.
Stack: **Next.js 15.4.11**, TypeScript (strict), Tailwind v4, Prisma + PostgreSQL, Cloudflare R2, Cloudinary, Ably.

> ⚠️ This is NOT standard Next.js. Read `node_modules/next/dist/docs/` before writing code.
> Route `params` and `searchParams` MUST be awaited as Promise before destructuring.

## Dev Commands

```bash
npm run dev          # Dev server (port 3000)
npm run build        # Production build (lint + typecheck + build)
npm run lint         # ESLint only
npm run db:push      # Push Prisma schema to DB
npm run db:generate  # Generate Prisma client
```

**Verify before every commit:**
```bash
npm run lint && npm run build
```

## Architecture

| Path | Purpose |
|------|---------|
| `src/app/(dashboard)/admin/` | Admin pages — auth required |
| `src/app/gallery/[token]/` | Public gallery — token-based, no auth |
| `src/app/api/admin/` | Admin API routes — auth required |
| `src/app/api/public/` | Public API routes |
| `src/app/api/webhook/` | Cloudflare Worker webhooks |
| `src/components/ui/` | shadcn/ui components (base-ui based) |
| `src/lib/storage/` | R2, Cloudinary, accounts, rotation, deletion |
| `src/lib/upload/` | Presigned URLs, analytics, cleanup, hash |
| `src/lib/cloudflare-queue.ts` | Cloudflare Queues publisher |
| `workers/` | Cloudflare Edge Workers |
| `prisma/schema.prisma` | Database schema |
| `docs/` | Documentation only — excluded from build |

## Code Style

- **TypeScript strict**: no `any`, use `unknown` or specific interfaces
- **Imports**: use `@/` alias for all `src/` imports
- **Notifications**: `toast()` from `sonner` — NEVER `alert()`
- **UI colors**: Tailwind v4 OKLCH semantic only (`bg-background`, `bg-card`, `text-foreground`, etc.)
- **Dialog**: `import { Dialog } from '@/components/ui/dialog'` — uses `@base-ui/react`, NOT Radix

## UI Conventions — Aura Noir Theme

**Aura Noir** = OLED Luxury dark theme. Always use semantic OKLCH colors:

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

**NEVER use:** static colors (`amber-500`, `gray-800`), `rgba(var(--primary))` syntax, light-mode colors.

## Storage Architecture

- **Cloudflare R2** — original files (direct upload via presigned URL, bypass server)
- **Cloudinary** — thumbnails ONLY
- Credentials from `StorageAccount` table in PostgreSQL — NOT from `.env`

**Direct Upload Flow:**
1. Client requests presigned URL from `/api/admin/upload/presigned`
2. Client uploads directly to R2 (bypass server)
3. Client calls `/api/admin/upload/complete` → queues thumbnail generation

**Supported file types:** `.jpg`, `.jpeg`, `.png`, `.webp`, `.heic`, `.nef`, `.cr2`, `.arw`, `.dng`, `.raw`

## Environment Variables

```env
DATABASE_URL=postgresql://...
CLOUDFLARE_API_TOKEN=...   # Wrangler & Queues
ABLY_API_KEY=...           # Real-time
NEXTAUTH_SECRET=...        # Auth
VPS_WEBHOOK_SECRET=...     # Webhook validation
```

## Critical Rules

### Storage Credentials
Cloudinary and R2 credentials come from the `StorageAccount` table in PostgreSQL — NOT from `.env`.

### BigInt Serialization
```typescript
// Prisma BigInt cannot JSON.stringify — always convert:
return successResponse({ fileSize: photo.fileSize?.toString() })
```

### Background Jobs
Use **Cloudflare Queues only** via `src/lib/cloudflare-queue.ts`.
NO BullMQ, NO PM2, NO Redis for task queues.

### API Response Pattern
```typescript
import { successResponse, errorResponse, unauthorizedResponse, notFoundResponse, paginatedResponse } from '@/lib/api/response'
```

### Pagination
```typescript
const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
const limit = Math.min(100, parseInt(searchParams.get('limit') ?? '20', 10))
```

## Security

- All `/api/admin/*` routes MUST call `getServerSession()` at the top
- Webhooks from Cloudflare Edge MUST validate `VPS_WEBHOOK_SECRET` header
- NEVER commit secrets, tokens, or credentials to the repository
- Validate all inputs with **Zod** — including date fields
- Handle Prisma `P2025` (not found) → return 404

## Testing

No CI test framework. Use **Playwright MCP** for interactive E2E testing — do NOT write manual test scripts.

Build + lint success = ready to commit:
```bash
npm run lint && npm run build
```

## Explicit Prohibitions

1. **NO bash for file operations** — use Filesystem MCP tools, not `cat`/`ls`/`grep`
2. **NO custom test scripts** — use Playwright MCP or Chrome DevTools MCP directly
3. **NO `alert()`** — use `sonner` `toast()` only
4. **NO BullMQ / PM2 / Redis** for background jobs — Cloudflare Queues only
5. **NO static Tailwind colors** — no `amber-500`, `gray-800`; use OKLCH semantic tokens
6. **NO `rgba(var(--primary))`** syntax in Tailwind v4
7. **NO unbounded queries** — always paginate, never fetch all records at once
8. **NO secrets in code** — never commit API keys, tokens, or credentials

## Kiro Configuration

### Steering Files
Project-specific rules are in `.kiro/steering/` — loaded automatically every session:

| File | Content |
|------|---------|
| `product.md` | Product overview, features, business rules |
| `tech.md` | Full stack details, library choices, constraints |
| `structure.md` | Directory layout, naming conventions, import patterns |
| `security.md` | Auth rules, secrets policy, DoS prevention |
| `api-standards.md` | Response format, pagination, BigInt, Zod patterns |
| `ui-conventions.md` | Aura Noir theme, OKLCH colors, component library |

### Hooks
Defined in `~/.kiro/agents/kiro.json`, run automatically:

| Hook | Trigger | Action |
|------|---------|--------|
| `agentSpawn` | Agent starts | Inject critical project rules into context |
| `preToolUse` (write) | Before file write | Block if secrets detected in content |
| `stop` | After each response | Run `npm run lint` if TS files were modified |

### Skills Available
Global skills in `~/.kiro/skills/` relevant to this project:
- `nextjs-best-practices` — Next.js App Router patterns
- `tailwind-v4-shadcn` — Tailwind v4 + shadcn/ui integration
- `shadcn` — shadcn/ui components, theming, forms
- `cloudinary` — Cloudinary API usage
- `nextauth-authentication` — NextAuth.js session management
- `prisma-database-setup` — Prisma + PostgreSQL configuration
- `playwright-generate-test` — E2E test generation via Playwright MCP
- `code-review-excellence` — Code review best practices

## MCP Tools Available

Prefer MCP tools over bash scripts for these tasks:

| Task | MCP |
|------|-----|
| Browser testing / UI verification | Playwright MCP |
| DOM inspection, JS evaluation, network logs | Chrome DevTools MCP |
| PR review, issues, code browsing | GitHub MCP |
| Next.js / Tailwind v4 docs | Context7 MCP |
| shadcn/ui components | shadcn MCP |
| UI component generation | 21st-dev MCP |
| File operations | Filesystem MCP |
