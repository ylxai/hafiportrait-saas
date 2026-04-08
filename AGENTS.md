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
npm run workers          # Start background workers (dev)
npm run workers:prod     # Start workers (production)
```

## Critical UI Conventions

```tsx
// ALWAYS use slate, NEVER gray
text-slate-800 / text-slate-500 / bg-slate-50

// Primary actions use amber
bg-amber-500 / focus:ring-amber-500/20

// Native inputs need explicit styling
<input className="border border-slate-300 rounded-lg focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20" />

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
| `src/lib/workers.ts` | BullMQ workers (separate process) |
| `prisma/schema.prisma` | Database schema |
| `docs/` | **Excluded from build** - Documentation only (cloudflare-example, deployment guides)

## Worker Deployment (CRITICAL)

**Workers MUST run as separate process from Next.js.**

```bash
# Development - need TWO terminals
npm run dev          # Terminal 1: Web
npm run workers      # Terminal 2: Workers

# Production with PM2 (recommended)
pm install -g pm2
pm2 start ecosystem.config.js
```

**Why separate?** Workers continue processing if web crashes. Can scale independently.

## Dual Storage Architecture

- **Cloudinary**: Thumbnails only
- **R2 (Cloudflare)**: Original files

**Direct Upload Flow** (no chunking):
1. Client requests presigned URL from API
2. Client uploads directly to R2 (bypass server)
3. Worker processes thumbnail generation asynchronously

**Photo Deletion**:
- API immediately deletes from database
- Storage cleanup (R2 + Cloudinary) queued for background processing
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
{ data: [...], pagination: { page: 1, limit: 20, total: 150, pages: 8 } }
```

## Environment Variables Required

```env
DATABASE_URL=postgresql://...
REDIS_URL=redis://...           # For queues
R2_*=...                        # Cloudflare R2 credentials
CLOUDINARY_*=...                # Cloudinary credentials
ABLY_API_KEY=...                # Real-time notifications
NEXTAUTH_SECRET=...             # Auth
```

## Verification Before Commit

```bash
npm run lint && npm run build
```

No test framework configured. Build + lint success = ready to commit.

## Key Files Reference

- `/src/lib/upload/presigned.ts` - R2 presigned URL generation
- `/src/hooks/useDirectUpload.ts` - Frontend upload hook with retry logic
- `/src/components/upload/UploadManager.tsx` - Upload UI component
- `/ecosystem.config.js` - PM2 configuration for workers
- `/docs/WORKERS_DEPLOYMENT.md` - Detailed deployment guide
- `/docs/cloudflare-example/` - Cloudflare integration examples:
  - **HYBRID**: Next.js VPS + Cloudflare Workers (recommended for existing projects)
  - **FULL**: 100% Cloudflare serverless (greenfield projects)
