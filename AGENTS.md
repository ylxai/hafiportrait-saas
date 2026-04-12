<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

Next.js 15.4.11 with breaking changes. Read guides in `node_modules/next/dist/docs/` before writing code.
<!-- END:nextjs-agent-rules -->

# PhotoStudio SaaS - Agent Reference

## Commands

```bash
npm run dev              # Dev server (port 3000)
npm run build            # Production build (lint + typecheck + build)
npm run lint             # ESLint only
npm run db:push          # Push Prisma schema to DB
npm run db:generate      # Generate Prisma client
npm run workers          # Start background workers (dev) - Note: Migrating to Cloudflare Edge Workers
npm run workers:prod     # Start workers (production) - Note: Migrating to Cloudflare Edge Workers
```

## Critical UI Conventions (Aura Noir Theme)

```tsx
// ALWAYS use semantic OKLCH colors for Aura Noir (The OLED Luxury)
text-foreground / text-muted-foreground / bg-background / bg-card / bg-card-hover

// Primary actions
bg-primary / text-primary-foreground / hover:bg-primary/90

// Native inputs need explicit styling
<input className="border border-border rounded-lg focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 bg-background text-foreground" />

// Dialog uses @base-ui/react (NOT Radix)
import { Dialog } from '@/components/ui/dialog'
```

## Architecture - READ BEFORE MODIFYING

| Directory | Purpose |
|-----------|---------|
| `src/app/(dashboard)/admin/` | Admin pages (require auth) |
| `src/app/gallery/[token]/` | Public gallery (no auth) |
| `src/app/api/admin/` | Admin API routes |
| `src/app/api/public/` | Public API routes |
| `src/components/ui/` | shadcn/ui components (base-ui based) |
| `workers/` | Cloudflare Edge Workers (planned migration for background tasks) |
| `prisma/schema.prisma` | Database schema |
| `docs/` | **Excluded from build** - Documentation only (Migration guides, Design proposals) |

## Background Jobs & Worker Deployment (CRITICAL)

**Currently migrating from PM2/BullMQ local workers to Cloudflare Queues + Cloudflare Workers (Native Edge).**

See `docs/CLOUDFLARE_EDGE_MIGRATION.md` and `docs/EXPERT_BACKGROUND_JOBS.md` for details.
- Background tasks (like deleting photos from R2/Cloudinary) will be handled by Cloudflare Edge Workers.
- Next.js acts as the Publisher, sending messages to Cloudflare Queues via HTTP POST.

## Dual Storage Architecture

- **Cloudinary**: Thumbnails only
- **R2 (Cloudflare)**: Original files

**Credentials Configuration**:
- Storage credentials (Cloudinary, R2) are **dynamically loaded from the PostgreSQL database** (`StorageAccount` table), NOT exclusively from `.env`. This allows multiple storage accounts to be configured and managed via the Admin Dashboard.

**Direct Upload Flow** (no chunking):
1. Client requests presigned URL from API
2. Client uploads directly to R2 (bypass server)
3. Worker processes thumbnail generation asynchronously / Client notifies webhook

**Photo Deletion**:
- API immediately deletes from database
- Storage cleanup (R2 + Cloudinary) is queued for background processing (Cloudflare Queues planned)
- This prevents API blocking and provides retry on failure

## Database - BigInt Serialization

```typescript
// Prisma BigInt cannot serialize to JSON directly
// ALWAYS convert to string in API responses:
return { 
  usedStorage: account.usedStorage.toString(),
  fileSize: photo.fileSize?.toString()  // Also for Photo model!
}
```

## File Upload - Supported Types

```typescript
// Client + server validation for:
['.jpg', '.jpeg', '.png', '.webp', '.heic', '.nef', '.cr2', '.arw', '.dng', '.raw']

// RAW files (.nef, .cr2, .arw, .dng, .raw) bypass browser compression
// (browser-image-compression doesn't support RAW formats)
```

## API Pagination Pattern

```typescript
// All admin list APIs support:
GET /api/admin/events?page=1&limit=20

// Response format:
{ data: { events: [...] }, pagination: { page: 1, limit: 20, total: 150, pages: 8 } }
```
*(Note: API responses are typically wrapped in a `data` object via the `successResponse` utility).*

## Environment Variables Required

```env
DATABASE_URL=postgresql://...
# REDIS_URL=redis://...         # Deprecated/Migrating out (used for BullMQ)
CLOUDFLARE_API_TOKEN=...        # Required for Wrangler & Queues (Use .dev.vars for Worker isolation)
ABLY_API_KEY=...                # Real-time notifications
NEXTAUTH_SECRET=...             # Auth
```

## Verification Before Commit

```bash
npm run lint && npm run build
```

No test framework configured for CI. Playwright is used for interactive/manual UI tests. Build + lint success = ready to commit.

## Completed Work (April 12, 2026)

### PRs Merged to Main

| PR # | Title | Status |
|------|-------|--------|
| #9 | fix/immediate-audit-fixes | ✅ MERGED |
| #10 | fix(galleries): type definition | ✅ MERGED |
| #11 | fix: critical bugs - error responses, validation, race condition | ✅ MERGED |
| #12 | feat: reusable UI components + frontend consistency | ✅ MERGED |
| #13 | fix: upload looping bug - race condition in useDirectUpload | ✅ MERGED |
| #14 | fix: multiple upload system bugs | ✅ MERGED |

### Bugs Fixed

**PR #11 - Critical API Bugs:**
- Error response helpers inconsistency
- Date validation missing in Zod schemas
- Race condition in booking code
- Missing Prisma P2025 error handling
- Input sanitization for XSS

**PR #12 - Frontend Consistency:**
- Created reusable components: loading.tsx, empty-state.tsx, pagination.tsx
- Fixed 44+ hardcoded amber-500 → semantic OKLCH colors

**PR #13 & #14 - Upload System:**
- Race condition in uploadWorker (processingIds + filesRef)
- activeUploads counter fix
- alert() → sonner toast
- selectedCloudinary sent to API
- uploadId uses crypto.randomUUID()
- File size validation (BigInt)
- R2 verification (HeadObject)
- Storage usage race condition fix
- Webhook Zod validation

## Key Files Reference

- `/docs/DESIGN_PROPOSAL_2026.md` - Aura Noir UI/UX design specifications
- `/docs/CLOUDFLARE_EDGE_MIGRATION.md` - Cloudflare Worker edge migration plan
- `/src/lib/upload/presigned.ts` - R2 presigned URL generation
- `/src/hooks/useDirectUpload.ts` - Frontend upload hook with retry logic
- `/src/components/upload/UploadManager.tsx` - Upload UI component

## AI Agent Behavior (MCP Integration)

**CRITICAL INSTRUCTION FOR AI AGENTS:**
You MUST prioritize using configured **Model Context Protocol (MCP)** tools for testing, browser automation, data fetching, and code review over writing manual Node.js/Python scripts (e.g., `test.js` or `get_logs.js`). 

Currently available MCP Servers (configured in `~/.junie/mcp/mcp.json`):
1. **Playwright MCP**: Use for interactive end-to-end browser testing, navigating pages, capturing snapshots, and verifying UI without writing manual Playwright scripts.
2. **Chrome DevTools MCP**: Use for inspecting DOM elements, evaluating JavaScript on live pages, and analyzing network/console logs.
3. **GitHub MCP**: Use for pulling PRs, adding review comments, creating issues, and browsing the codebase.
4. **Context7 MCP**: Use for fetching up-to-date documentation and code snippets for Next.js, Tailwind v4, etc.
5. **shadcn MCP**: Use to search and load the latest shadcn/ui and base-ui components directly.
6. **Filesystem & Memory**: Local project file manipulation and entity context storage.

If an MCP tool can accomplish the task, **USE IT DIRECTLY** rather than simulating it via terminal commands.

## Security Rules
1. **No Secrets in Code**: Never commit sensitive tokens (e.g., `CLOUDFLARE_API_TOKEN`, `VPS_WEBHOOK_SECRET`) to the repository. Use `.gitignore` for `.dev.vars`, `.env`, and secret files.
2. **Denial of Service (DoS) Prevention**: Always cap API query parameters. For example, limit pagination sizes using `Math.min(limit, 100)` and enforce radix `10` in `parseInt`.
3. **Authentication**: All Admin API routes (`/api/admin/*`) MUST implement session authentication checks (e.g., `getServerSession()`).
4. **Webhook Verification**: Webhooks from Cloudflare Edge MUST validate `VPS_WEBHOOK_SECRET` before processing.

## Explicit Prohibitions
1. **NO Bash for Filesystem**: Do NOT use bash commands like `cat`, `ls`, `grep` for reading or searching files. Always use the built-in MCP filesystem tools (`open`, `search_contents_by_grep`, `search_paths_by_glob`).
2. **NO Custom Test Scripts**: Do NOT write custom Node.js/Python scripts (e.g., `test.js`, `get_logs.js`) to test UI or API. Always use **Playwright MCP** or **Chrome DevTools MCP** directly for interactive testing.
3. **NO Blocking UI**: Do NOT use `alert()` or blocking dialogues. Use `sonner` `toast()` for non-blocking UI notifications.
4. **NO Over-fetching**: Do NOT fetch unbounded relationships (e.g., 10,000 photos at once) in Admin dashboard APIs to prevent Out-Of-Memory. Always use Server-Side Pagination.
5. **NO Legacy Tailwind**: Do NOT use `rgba(var(--primary))` syntax in Tailwind v4 shadows; use direct RGB values. Do NOT use light-mode static colors for the Aura Noir theme.
6. **NO Redis/BullMQ for Background Jobs**: Do NOT use or install `bullmq` or `PM2` for background jobs. This project strictly uses Cloudflare Queues + Cloudflare Workers (Native Edge). Note: `ioredis` and Valkey are permitted STRICTLY for caching layers, not for task queues.

## Coding Style & Best Practices
1. **TypeScript Strictness**: Always use TypeScript with strict `no-any` types. Avoid using `any` at all costs; use `unknown` or specific interfaces.
2. **Aura Noir Design System**: Strictly use Tailwind v4 OKLCH semantic colors (`bg-background`, `bg-card`, `text-foreground`). The UI should be dominant dark, luxurious, and OLED-friendly.
3. **Next.js 15 Compatibility**: Route `params` and `searchParams` must be awaited as `Promise` before destructured.
4. **Dynamic Storage Credentials**: Cloudinary and Cloudflare R2 credentials must be dynamically fetched from the `StorageAccount` table in PostgreSQL, not hardcoded from `.env`.
5. **Continuous Learning**: Always load and check `.junie/memory/errors.md` and `.junie/memory/tasks.md` across sessions to persist context and rules.