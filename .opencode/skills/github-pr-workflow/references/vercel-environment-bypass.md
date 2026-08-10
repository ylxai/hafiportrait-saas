# Vercel Environment-Based Bypass Pattern

When implementing features that should behave differently in development/preview vs production (rate limiting, feature flags, strict validation), use Vercel's automatic environment variables for clean bypass logic.

## Vercel Environment Variables (Automatic)

Vercel automatically injects these into every deployment:

| Variable | Preview | Production |
|----------|---------|------------|
| `VERCEL_ENV` | `preview` | `production` |
| `VERCEL_URL` | `your-app-git-branch-user.vercel.app` | `your-app.vercel.app` |
| `VERCEL_GIT_COMMIT_REF` | Branch name (e.g., `feat/rate-limiting`) | `main` |

**No configuration needed** - these are injected automatically by Vercel platform.

## Pattern: Rate Limiting with Preview Bypass

**Use case:** Rate limiting should be disabled in preview deployments for testing, but active in production.

```typescript
// src/lib/rate-limit.ts
export async function checkRateLimit(
  identifier: string,
  config: RateLimitConfig
): Promise<{ success: boolean; remaining: number; resetAt: number }> {
  // 1. Bypass in Vercel preview deployments (development/testing)
  if (process.env.VERCEL_ENV === 'preview') {
    return {
      success: true,
      remaining: config.maxRequests,
      resetAt: Date.now() + config.windowMs,
    };
  }

  // 2. Emergency override (manual env var, works in any environment)
  if (process.env.DISABLE_RATE_LIMIT === 'true') {
    logger.warn('rate_limit.bypass', {
      reason: 'DISABLE_RATE_LIMIT=true',
      vercel_env: process.env.VERCEL_ENV,
    });
    return {
      success: true,
      remaining: config.maxRequests,
      resetAt: Date.now() + config.windowMs,
    };
  }

  // 3. Normal rate limiting for production
  // ... actual rate limiting logic ...
}
```

## Benefits

1. **Zero configuration** - Works immediately in all preview deployments
2. **No manual env vars** - No need to set `DISABLE_RATE_LIMIT` for every preview
3. **Automatic** - Every PR gets a preview with bypass enabled
4. **Safe** - Production always has rate limiting active
5. **Testable** - Can still test rate limiting in preview by temporarily commenting out bypass

## Emergency Override Pattern

For production incidents where you need to temporarily disable a feature:

```typescript
// Emergency bypass (requires manual env var)
if (process.env.DISABLE_RATE_LIMIT === 'true') {
  logger.warn('rate_limit.bypass', {
    reason: 'DISABLE_RATE_LIMIT=true',
    vercel_env: process.env.VERCEL_ENV,
  });
  return { /* bypass response */ };
}
```

**Usage:**
1. Vercel Dashboard → Settings → Environment Variables
2. Add `DISABLE_RATE_LIMIT=true` to Production environment only
3. Redeploy
4. Rate limiting disabled temporarily
5. Fix issue → Remove env var → Redeploy

**Important:** Log the bypass with context (reason, environment) for audit trail.

## Testing Flow

### Preview Deployment (Automatic)
```bash
# Create PR → Vercel deploys preview
# VERCEL_ENV=preview → rate limiting disabled automatically
# Test all endpoints without hitting limits
curl https://your-app-git-feat-rate-limiting-user.vercel.app/api/admin/analytics
# No 429 errors, unlimited requests
```

### Production Deployment
```bash
# Merge PR → Vercel deploys production
# VERCEL_ENV=production → rate limiting active
# 60 req/min for reads, 30 req/min for writes
for i in {1..65}; do
  curl https://your-app.vercel.app/api/admin/analytics
done
# Request 61+ returns 429 Too Many Requests
```

## Common Mistakes

❌ **Don't check `NODE_ENV`** - Not reliable in Vercel (always `production`)
```typescript
// Wrong - NODE_ENV is 'production' in preview too
if (process.env.NODE_ENV === 'development') { /* bypass */ }
```

✅ **Use `VERCEL_ENV`** - Reliable and automatic
```typescript
// Correct - VERCEL_ENV distinguishes preview from production
if (process.env.VERCEL_ENV === 'preview') { /* bypass */ }
```

❌ **Don't add manual env vars for preview bypass**
```typescript
// Wrong - requires manual configuration for every preview
if (process.env.DISABLE_RATE_LIMIT_IN_PREVIEW === 'true') { /* bypass */ }
```

✅ **Use automatic Vercel variables**
```typescript
// Correct - works automatically in all previews
if (process.env.VERCEL_ENV === 'preview') { /* bypass */ }
```

## Other Use Cases

### Feature Flags
```typescript
// Enable experimental feature only in preview
const enableExperimentalFeature = process.env.VERCEL_ENV === 'preview';
```

### Strict Validation
```typescript
// Relaxed validation in preview, strict in production
const strictMode = process.env.VERCEL_ENV === 'production';
```

### External Service Mocking
```typescript
// Use mock service in preview, real service in production
const apiUrl = process.env.VERCEL_ENV === 'preview'
  ? 'https://mock-api.example.com'
  : 'https://api.example.com';
```

### Logging Verbosity
```typescript
// Verbose logging in preview, minimal in production
const logLevel = process.env.VERCEL_ENV === 'preview' ? 'debug' : 'info';
```

## Documentation Pattern

When documenting features with Vercel bypass, explain both behaviors:

```markdown
## Rate Limiting

**Preview Deployments:**
- Rate limiting automatically disabled
- `VERCEL_ENV=preview` → bypass active
- Test freely without hitting limits

**Production:**
- Rate limiting active
- 60 req/min for reads, 30 req/min for writes
- Returns 429 when limit exceeded

**Emergency Override:**
- Add `DISABLE_RATE_LIMIT=true` to Production environment variables
- Redeploy to apply
- Remove after incident resolved
```

## Session Context (2026-05-23)

**PR #99** - Rate limiting implementation with Vercel preview bypass:
- User asked: "masalahnya saya tidak menggunakan lokal . dan tidak menggunakan .env atau .env.local . karena di vercel saja ada preview dan production"
- Solution: Use `VERCEL_ENV=preview` for automatic bypass, no manual configuration needed
- Result: Zero-config development bypass, production security maintained
- User confirmed: No need to add any environment variables to Vercel dashboard

**Key insight:** When user deploys only to Vercel (no local development), Vercel's automatic environment variables provide the cleanest solution. No `.env.local`, no manual configuration, just works.
