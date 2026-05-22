# Rate Limiting Implementation Guide

> **Status:** Partial implementation (3/11 routes completed)  
> **PR:** #99 (in progress)  
> **Date:** 2026-05-22

---

## Overview

Adding rate limiting to 11 admin routes to prevent DoS attacks and brute-force attempts. Implementation includes Vercel preview bypass for development/testing.

---

## ✅ Completed (3/11 routes)

| Route | Methods | Rate Limit | Status |
|-------|---------|------------|--------|
| `/api/admin/analytics` | GET | ADMIN_READ (60/min) | ✅ Done |
| `/api/admin/clients` | GET, POST | ADMIN_READ, ADMIN_WRITE | ✅ Done |
| `/api/admin/events` | GET | ADMIN_READ (60/min) | ✅ Done |

---

## ⏳ Remaining (8 routes, 21 methods)

| # | Route | Methods | Rate Limits |
|---|-------|---------|-------------|
| 1 | `/api/admin/events` | POST, PATCH | ADMIN_WRITE (30/min) |
| 2 | `/api/admin/failed-jobs` | GET, DELETE | ADMIN_READ, ADMIN_WRITE |
| 3 | `/api/admin/finance` | GET | ADMIN_READ (60/min) |
| 4 | `/api/admin/galleries` | GET, POST | ADMIN_READ, ADMIN_WRITE |
| 5 | `/api/admin/packages` | GET, POST, PATCH, DELETE | ADMIN_READ, ADMIN_WRITE |
| 6 | `/api/admin/settings` | GET, POST | ADMIN_READ, ADMIN_WRITE |
| 7 | `/api/admin/stats` | GET | STATS (30/min) |
| 8 | `/api/admin/storage-accounts` | GET, POST, PATCH, DELETE | ADMIN_READ, ADMIN_WRITE |
| 9 | `/api/admin/storage-config` | GET, PATCH | ADMIN_READ, ADMIN_WRITE |

---

## Implementation Pattern

### 1. Add Import (if not exists)

```typescript
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
```

### 2. Add Rate Limiting After Auth Check

```typescript
export async function GET(request: Request) {
  try {
    const auth = await checkAuth();
    if (auth instanceof NextResponse) return auth;

    // Rate limiting
    const rateLimitResult = await checkRateLimit(
      `route-name:method:${auth.user.email}`,
      RATE_LIMITS.ADMIN_READ  // or ADMIN_WRITE, STATS
    );
    if (!rateLimitResult.success) {
      return errorResponse('Too many requests', 429);
    }

    // ... rest of handler
  }
}
```

### 3. Rate Limit Types

| Type | Limit | Use Case |
|------|-------|----------|
| `ADMIN_READ` | 60 req/min | GET operations (list, fetch) |
| `ADMIN_WRITE` | 30 req/min | POST, PATCH, DELETE operations |
| `STATS` | 30 req/min | Cached stats/analytics endpoints |

---

## Bypass Logic (Already Implemented)

### Vercel Preview (Development/Testing)

```typescript
// Automatic bypass in preview deployments
if (process.env.VERCEL_ENV === 'preview') {
  return { success: true, remaining: config.maxRequests, resetAt: ... };
}
```

**No configuration needed** - rate limiting automatically disabled in all preview deployments.

### Emergency Override (Production)

```typescript
// Manual bypass for production incidents
if (process.env.DISABLE_RATE_LIMIT === 'true') {
  logger.warn('rate_limit.bypass', { reason: 'DISABLE_RATE_LIMIT=true', ... });
  return { success: true, remaining: config.maxRequests, resetAt: ... };
}
```

**Usage:**
1. Vercel Dashboard → Settings → Environment Variables
2. Add `DISABLE_RATE_LIMIT=true` to Production environment
3. Redeploy
4. Remove env var after incident resolved

---

## Testing

### Preview Deployment
```bash
# Create PR → Vercel creates preview
# VERCEL_ENV=preview → rate limiting disabled
# Test freely without hitting limits
```

### Production
```bash
# After merge → Vercel deploys to production
# VERCEL_ENV=production → rate limiting active
# 60 req/min for reads, 30 req/min for writes
```

### Manual Testing
```bash
# Test rate limiting in preview (if needed)
# Temporarily comment out the preview bypass in rate-limit.ts
```

---

## Next Steps

1. **Continue implementation** - Add rate limiting to remaining 8 routes (21 methods)
2. **Test in preview** - Verify bypass logic works correctly
3. **Update audit report** - Mark H1 as completed in `docs/AUDIT-REPORT-2026-05-21.md`
4. **Merge PR** - After all routes completed and tested

---

## Files Modified

- `src/lib/rate-limit.ts` - Added bypass logic + new constants
- `src/app/api/admin/analytics/route.ts` - Added rate limiting (GET)
- `src/app/api/admin/clients/route.ts` - Added rate limiting (GET, POST)
- `src/app/api/admin/events/route.ts` - Added rate limiting (GET) + import

---

## References

- **Audit Report:** `docs/AUDIT-REPORT-2026-05-21.md` (H1 issue)
- **Action Plan:** `ACTION-PLAN-2026-05-21.md` (Week 1 priority)
- **Pattern:** Existing rate-limited routes (upload/complete, bulk-delete, search)
