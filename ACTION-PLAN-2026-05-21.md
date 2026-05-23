# hafiportrait-saas Action Plan

> Generated: 2026-05-21 18:20 UTC  
> Based on: 2 audit reports (Kiro AI + Hermes)  
> Status: Project BAIK (B+ grade) with critical fixes needed

---

## Executive Summary

**2 Audit Reports Analyzed:**
1. **Kiro AI Audit** (18:12 UTC) - Technical/Security focus
2. **Hermes Audit** (18:15 UTC) - Feature/Roadmap focus

**Combined Findings:**
- 5 CRITICAL issues (fix this week)
- 3 HIGH priority items (next sprint)
- 6 MEDIUM priority features (backlog)

**Total Effort:** 3 weeks for all critical + high priority items

---

## 🔴 CRITICAL (Week 1: 20-24 hours)

### Day 1-2: Quick Wins + Security (8-11 hours)

**1. Merge PR #36 - E2E Test Suite** ⏱️ 30 menit
- **Status:** Ready for review since April 16
- **Coverage:** 63 tests across 10 suites
- **Impact:** Enable CI/CD, prevent regressions
- **Action:**
  ```bash
  gh pr review 36 --approve
  gh pr merge 36 --squash
  ```

**2. Fix N+1 Query in Clients Route** ⏱️ 1-2 jam
- **Location:** `src/app/api/admin/clients/route.ts` (lines 64-82)
- **Problem:** 21 queries per page load (500ms+ latency)
- **Solution:** Use existing `Client.usedStorage` column
- **Impact:** 500ms latency reduction
- **Files to modify:**
  - `src/app/api/admin/clients/route.ts`

**Before:**
```typescript
const clientsWithUsage = await Promise.all(
  clients.map(async (client) => {
    const usage = await prisma.photo.aggregate({
      where: { gallery: { event: { clientId: client.id } } },
      _sum: { fileSize: true },
    });
    return { ...client, usedStorageBytes: usage._sum.fileSize };
  })
);
```

**After:**
```typescript
const clients = await prisma.client.findMany({
  select: {
    id: true,
    nama: true,
    email: true,
    usedStorage: true, // ← Use this column (already maintained)
    storageQuotaGB: true,
    // ... other fields
  },
});
```

**3. Add Webhook Signature Validation** ⏱️ 2-3 jam
- **Routes:** `/api/webhook/storage-deleted`, `/api/webhook/thumbnail-generated`
- **Problem:** No HMAC verification, unauthorized callbacks possible
- **Solution:** Implement HMAC-SHA256 signature check
- **Impact:** Prevent data corruption from fake webhooks
- **Files to modify:**
  - `src/app/api/webhook/storage-deleted/route.ts`
  - `src/app/api/webhook/thumbnail-generated/route.ts`
  - `src/lib/webhook-signature.ts` (new file)

**Implementation:**
```typescript
// src/lib/webhook-signature.ts
import crypto from 'crypto';

export function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  const hmac = crypto.createHmac('sha256', secret);
  const digest = hmac.update(payload).digest('hex');
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(digest)
  );
}

// In webhook route:
const signature = request.headers.get('x-webhook-signature');
const rawBody = await request.text();

if (!verifyWebhookSignature(rawBody, signature, process.env.WEBHOOK_SECRET)) {
  return errorResponse('Invalid signature', 401);
}
```

**4. Add Rate Limiting to Remaining Routes** ⏱️ 4-6 jam
- **Problem:** Only 8/60 routes protected, DoS vulnerability
- **Solution:** Apply rate limiting middleware to all mutation endpoints
- **Impact:** DoS prevention
- **Routes to protect:** 52 unprotected routes
- **Files to modify:**
  - `src/middleware.ts` (add rate limit check)
  - All `/api/admin/*` mutation routes

**Implementation:**
```typescript
// src/middleware.ts
import { rateLimit } from '@/lib/rate-limit';

export async function middleware(request: NextRequest) {
  // Apply rate limiting to all API routes
  if (request.nextUrl.pathname.startsWith('/api/')) {
    const rateLimitResult = await rateLimit(request);
    if (!rateLimitResult.success) {
      return new Response('Too many requests', { status: 429 });
    }
  }
  // ... existing auth logic
}
```

---

### Day 3-4: Data Integrity (11-14 hours)

**5. Fix Dedup Orphan Bug** ⏱️ 8-10 jam
- **Problem:** When gallery deleted, deduped photos in other galleries show broken images
- **Root cause:** No reference counting for deduped photos
- **Solution:** Add `sourcePhotoId` + `referenceCount` fields
- **Impact:** Prevent data loss (HIGH RISK)
- **Files to modify:**
  - `prisma/schema.prisma`
  - `src/lib/storage/deletion.ts`
  - `src/app/api/admin/upload/complete/route.ts`
  - `src/lib/cloudflare-queue.ts`
  - `scripts/backfill-reference-count.ts` (new migration script)

**Schema changes:**
```prisma
model Photo {
  // ... existing fields
  sourcePhotoId  String?  // Points to original if this is a deduped copy
  referenceCount Int      @default(1) // How many other photos reference this R2 file
  
  sourcePhoto    Photo?   @relation("PhotoDedup", fields: [sourcePhotoId], references: [id], onDelete: SetNull)
  dedupedCopies  Photo[]  @relation("PhotoDedup")
}
```

**Deletion logic update:**
```typescript
// src/lib/storage/deletion.ts
export async function deletePhoto(photoId: string) {
  const photo = await prisma.photo.findUnique({
    where: { id: photoId },
    include: { sourcePhoto: true },
  });

  // If this is a deduped copy, decrement source's reference count
  if (photo.sourcePhotoId) {
    await prisma.photo.update({
      where: { id: photo.sourcePhotoId },
      data: { referenceCount: { decrement: 1 } },
    });
  }

  // Only delete R2 file if referenceCount === 0
  if (photo.referenceCount === 0) {
    await queueStorageDeletion({ r2Key: photo.r2Key, ... });
  }

  await prisma.photo.delete({ where: { id: photoId } });
}
```

**6. Storage Health Dashboard** ⏱️ 3-4 jam
- **Problem:** No visibility into per-client usage, quota overruns
- **Solution:** Build dashboard widget + health endpoint
- **Impact:** Prevent quota issues, monitor usage
- **Files to create:**
  - `src/app/api/admin/storage/health/route.ts`
  - `src/components/admin/StorageHealthWidget.tsx`
  - `src/lib/alerts/quota-alert.ts`
- **Files to modify:**
  - `src/app/(dashboard)/admin/page.tsx` (add widget)

**Health endpoint:**
```typescript
// src/app/api/admin/storage/health/route.ts
export async function GET() {
  const clients = await prisma.client.findMany({
    select: {
      id: true,
      nama: true,
      usedStorage: true,
      storageQuotaGB: true,
    },
    orderBy: { usedStorage: 'desc' },
    take: 10, // Top 10 by usage
  });

  const alerts = clients
    .filter(c => c.usedStorage > c.storageQuotaGB * 0.8 * 1e9)
    .map(c => ({
      clientId: c.id,
      nama: c.nama,
      usagePercent: (c.usedStorage / (c.storageQuotaGB * 1e9)) * 100,
    }));

  return successResponse({ clients, alerts });
}
```

---

### Day 5: Observability (8 hours)

**7. Structured Logging + Sentry Integration** ⏱️ 1 hari
- **Problem:** No structured logging, no error aggregation
- **Solution:** Winston/Pino + Sentry
- **Impact:** Production debugging, error tracking
- **Files to create:**
  - `src/lib/logger.ts` (Winston/Pino setup)
  - `src/lib/sentry.ts` (Sentry config)
- **Files to modify:**
  - All API routes (replace console.error)
  - `next.config.ts` (Sentry webpack plugin)

**Logger setup:**
```typescript
// src/lib/logger.ts
import winston from 'winston';

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
  ],
});

// Usage in routes:
logger.error('upload.complete.failed', {
  uploadId,
  error: error.message,
  stack: error.stack,
});
```

**Sentry setup:**
```typescript
// src/lib/sentry.ts
import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 0.1,
});
```

---

## ⚠️ HIGH PRIORITY (Week 2: Sprint Planning)

**8. Unit Tests for Critical Paths** ⏱️ 2-3 hari
- **Coverage targets:**
  - Dedup logic (`src/lib/storage/dedup.ts`)
  - Quota enforcement (`src/lib/storage/quota.ts`)
  - Deletion logic (`src/lib/storage/deletion.ts`)
- **Framework:** Jest + Supertest
- **Files to create:**
  - `tests/unit/storage/dedup.test.ts`
  - `tests/unit/storage/quota.test.ts`
  - `tests/unit/storage/deletion.test.ts`

**9. Complete Photo Selection Workflow** ⏱️ 3-4 hari
- **Current status:** Model exists, UI partial
- **Missing:**
  - Export selected photos to ZIP endpoint
  - Realtime Ably notifications
  - Admin dashboard selection view
- **Files to create:**
  - `src/app/api/admin/galleries/[id]/export-selected/route.ts`
  - `src/components/admin/SelectionNotifications.tsx`
- **Files to modify:**
  - `src/app/(dashboard)/admin/galleries/[id]/page.tsx`

**10. Watermark Generator** ⏱️ 3-5 hari
- **Highest ROI feature**
- **Implementation:**
  - Cloudinary transformation API
  - Admin settings for watermark config
  - Gallery-level watermark toggle
  - Payment webhook removes watermark
- **Files to create:**
  - `src/lib/storage/watermark.ts`
  - `src/app/(dashboard)/admin/settings/watermark/page.tsx`
- **Schema changes:**
  ```prisma
  model Gallery {
    watermarkEnabled Boolean @default(false)
  }
  
  model Settings {
    watermarkLogo     String?
    watermarkText     String?
    watermarkPosition String?
  }
  ```

---

## 💡 MEDIUM PRIORITY (Backlog)

**11. Gallery Analytics Enhancement** ⏱️ 2-3 hari
- Per-photo downloadCount tracking
- Top 5 most viewed photos widget
- Client engagement metrics

**12. Request Size Limits**
- Add Next.js bodyParser size limit
- Prevent memory exhaustion

**13. Circuit Breaker for Cloudinary**
- Exponential backoff on repeated failures
- Automatic failover

**14. Orphaned File Cleanup Job**
- Weekly R2 scan for files without DB records
- Automated cleanup

**15. API Versioning**
- `/api/v1/` prefix
- Future-proofing

**16. 2FA Support**
- TOTP-based authentication
- Enhanced security

---

## Verification Checklist

After each fix, run:

```bash
# Lint + typecheck
npm run lint

# Build
npm run build

# E2E tests (after PR #36 merged)
npm run test:e2e

# Unit tests (after #8 implemented)
npm run test:unit
```

---

## Environment Variables Needed

Add to `.env`:

```bash
# Webhook security
WEBHOOK_SECRET=your-webhook-secret-here

# Sentry
SENTRY_DSN=https://...@sentry.io/...

# Logging
LOG_LEVEL=info
```

---

## Success Metrics

**Week 1 Goals:**
- ✅ PR #36 merged
- ✅ N+1 query fixed (500ms+ latency reduction)
- ✅ Webhook signatures implemented
- ✅ Rate limiting on all routes
- ✅ Dedup orphan bug fixed
- ✅ Storage health dashboard live
- ✅ Sentry integrated

**Week 2-3 Goals:**
- ✅ Unit test coverage >70%
- ✅ Photo selection workflow complete
- ✅ Watermark generator live

**KPIs:**
- API response time <200ms (p95)
- Zero data loss incidents
- Error rate <0.1%
- Test coverage >70%

---

## Risk Mitigation

**High Risk Items:**
1. **Dedup orphan fix** - Test thoroughly with staging data
2. **Rate limiting** - Monitor for false positives
3. **Webhook signatures** - Coordinate with Worker deployment

**Rollback Plan:**
- Keep feature flags for new features
- Database migrations are reversible
- Monitor error rates post-deployment

---

## Next Steps

**Immediate Actions:**
1. Review this action plan
2. Prioritize tasks based on business impact
3. Create GitHub issues for each task
4. Assign to sprint

**Questions to Answer:**
- Which tasks to tackle first?
- Need help with implementation details?
- Want me to start with any specific task?

---

*Generated by Hermes Agent*  
*Based on 2 comprehensive audits*  
*Ready for sprint planning*
