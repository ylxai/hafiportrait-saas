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

## Key Files Reference

- `/docs/DESIGN_PROPOSAL_2026.md` - Aura Noir UI/UX design specifications
- `/docs/CLOUDFLARE_EDGE_MIGRATION.md` - Cloudflare Worker edge migration plan
- `/src/lib/upload/presigned.ts` - R2 presigned URL generation
- `/src/hooks/useDirectUpload.ts` - Frontend upload hook with retry logic
- `/src/components/upload/UploadManager.tsx` - Upload UI component