# PhotoStudio SaaS — Environment & Configuration

> All config sources: `.env`, Vercel, and runtime environment.

---

## 1. `.env` (Local Development)

```env
# Required ──────────────────────────────────────────────────
DATABASE_URL=prisma+postgres://accelerate.prisma-data.net/?api_key=...
DIRECT_URL=postgresql://...                             # For db:push only
NEXTAUTH_SECRET=BRRKq/4N/V42AxD0ia4Huz8k/T94uzMS/xfMEmm8GQs=
NEXTAUTH_URL=http://localhost:3000                    # Base URL for callbacks
ABLY_API_KEY=HfnUMw.NKtTdA:CxmZ7wqYhXv1g78XMZ3MNVTGowwti8JV55oGRky-xco
VPS_WEBHOOK_SECRET=dev-webhook-secret-change-in-production
CLOUDFLARE_WORKER_URL=https://photostudio-deletion-worker.masipah1973.workers.dev

# Optional ─────────────────────────────────────────────────
RESEND_API_KEY=re_your_api_key_here                    # Email magic links
NEXT_PUBLIC_URL=http://localhost:3000                  # Public URL (for links)
VERCEL_AUTOMATION_BYPASS_SECRET=rrl1yNdMMWQMg95VEmHDQ09fvtGIRSeD  # For E2E against preview
LOG_LEVEL=debug                                        # Logger verbosity

# Kernel Browser Automation ───────────────────────────────
# Kernel API key (cloud browsers)
# KERNEL_API_KEY=sk_b183d707-5496-474b-a69d-219bf210547e.TN5lDMo4BvzlGIxpiOlZyh+FGAZPw2+g7XnrxJUMi4g

# Deprecated / Not Used on This Project ───────────────────
# NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=...   # Storage creds in DB
# R2_ACCESS_KEY=...                       # (moved to StorageAccount)
```

---

## 2. Environment Variables in Code

### Runtime Access
```typescript
// ✅ Safe — validated + typed env
dotenv.config()
import { env } from '@/lib/env.server'
env.CLOUDFLARE_WORKER_URL  // string (validated at startup)
env.DATABASE_URL           // string
env.NEXTAUTH_SECRET        // string
```

### DO NOT use `process.env.*` directly
```typescript
// ❌ Bad — not typed, not validated
const url = process.env.CLOUDFLARE_WORKER_URL

// ✅ Good — typed, validated, fails fast if missing
import { env } from '@/lib/env.server'
const url = env.CLOUDFLARE_WORKER_URL
```

### Client-Side Access
```typescript
// ✅ NEXT_PUBLIC_ prefix required for client
const baseUrl = process.env.NEXT_PUBLIC_URL
```

---

## 3. Vercel Config

### Project Settings
- **Project ID**: `prj_VoHbI9F4ZPQYDgE4RorWe91QgCe1`
- **Region**: `sin1` (Singapore)
- **Branch**: `main` (production)
- **Preview URLs**: Auto-generated per-PR

### Function Limits (vercel.json)
| Route Pattern | Timeout | Memory |
|---|---|---|
| `/api/admin/*` | 30s | 1024 MB |
| `/api/webhook/*` | 60s | 1024 MB |
| `/api/*` | 10s | 512 MB |

### Vercel CLI Commands
```bash
vercel                          # Deploy to preview
vercel --prod                   # Promote to production
vercel ls                       # List deployments
vercel logs --limit 30          # View recent logs
```

---

## 4. Scripts (package.json)

```bash
npm run dev                       # Development server (port 3000)
npm run build                     # Production build (lint + typecheck + build)
npm run lint                      # ESLint only
npm run test:e2e                  # Full E2E test suite
npm run test:e2e:ui               # With UI mode
npm run test:e2e:debug            # Debug mode
npm run test:e2e:admin           # Admin tests only
npm run db:push                   # Push schema to Neon (requires DIRECT_URL)
npm run db:generate              # Generate Prisma client
npm run db:seed                   # Seed development data
```

### Pre-commit Checklist
```bash
npm run lint && npm run build     # Must pass before PR
```

---

## 5. MCP Tools (AI Automation)

| Task | MCP | Purpose |
|---|---|---|
| Browser testing | Playwright MCP | Automated UI testing |
| DOM inspection | Chrome DevTools MCP | Debug page structure |
| PR/GitHub | GitHub MCP | PR creation, review, merge |
| Docs lookup | Context7 MCP | Search codebase docs |
| shadcn/ui | shadcn MCP | UI component management |
| File ops | Filesystem MCP | File manipulation |
| Database queries | Tiger MCP | Direct DB inspection |
