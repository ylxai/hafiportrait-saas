# Refactoring Recommendations

## Quick Wins (1-2 hours)

### 1. Remove Development Console.log Statements

**Priority:** HIGH  
**Effort:** 15 minutes  
**Impact:** Clean production bundle, reduce noise

```typescript
// File: src/hooks/useDirectUpload.ts
// Remove lines 332, 442, 447, 474

// BEFORE:
console.log(`[Upload] Retrying ${uploadFile.file.name}...`);
console.log(`[Upload] Starting upload of ${pendingFiles.length} pending files...`);
console.log(`[Upload] Small batch detected...`);
console.log(`[Upload] Large batch detected...`);

// AFTER: Remove all or wrap with environment check
if (process.env.NODE_ENV === 'development') {
  console.log(`[Upload] Starting upload of ${pendingFiles.length} pending files...`);
}
```

```typescript
// File: src/components/upload/UploadManager.tsx
// Remove line 69

// BEFORE:
console.log('Photo uploaded:', photo);

// AFTER: Remove completely
```

```typescript
// File: src/app/(dashboard)/admin/galleries/[id]/page.tsx
// Remove lines 754-755

// BEFORE:
callbacks: {
  click: () => console.log("[Lightbox] Clicked"),
  view: (index) => console.log("[Lightbox] Viewing index:", index),
}

// AFTER:
callbacks: {
  click: () => {},
  view: () => {},
}
```

---

### 2. Fix Type Assertion in Gallery Page

**Priority:** HIGH  
**Effort:** 10 minutes  
**Impact:** Type safety restored

```typescript
// File: src/app/gallery/[token]/page.tsx

// BEFORE (lines 145-146):
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const initialData = { data: payload } as any;

// AFTER:
import type { PublicGalleryPayloadJSON } from '@/lib/gallery/load-public-gallery';

interface SWRGalleryInitialData {
  data: PublicGalleryPayloadJSON;
}

const initialData: SWRGalleryInitialData = { data: payload };
```

---

### 3. Create Centralized Constants File

**Priority:** MEDIUM  
**Effort:** 30 minutes  
**Impact:** Reduce duplication, easier maintenance

```typescript
// File: src/lib/constants.ts (NEW)

/**
 * Application-wide constants
 * Centralized configuration for consistency across the codebase
 */

// ============================================================================
// Authentication & Security
// ============================================================================

/** bcrypt cost factor for password hashing */
export const BCRYPT_ROUNDS = 10;

// ============================================================================
// Query Limits
// ============================================================================

export const QUERY_LIMITS = {
  /** Recent items in dashboard widgets */
  RECENT_ITEMS: 5,
  
  /** Search results per entity type */
  SEARCH_RESULTS_PER_TYPE: 10,
  
  /** Galleries per page in admin list */
  GALLERY_LIST_PAGE: 20,
  
  /** Photos per page in gallery detail view */
  GALLERY_PHOTOS_PAGE: 50,
  
  /** Default limit for failed jobs list */
  FAILED_JOBS_DEFAULT: 50,
  
  /** Maximum limit for failed jobs list */
  FAILED_JOBS_MAX: 100,
  
  /** Photos per page in public gallery */
  PHOTOS_PER_PAGE: 100,
} as const;

// ============================================================================
// Retry Configuration
// ============================================================================

export const RETRY_CONFIG = {
  /** Max retries for booking code generation (unique constraint) */
  BOOKING_CODE_GENERATION: 5,
  
  /** Max retries for Cloudflare Queue operations */
  QUEUE_OPERATIONS: 3,
  
  /** Max retries for general API operations */
  API_OPERATIONS: 5,
} as const;

// ============================================================================
// Cache TTL (Time To Live)
// ============================================================================

export const CACHE_TTL_SECONDS = {
  /** Dashboard statistics cache */
  DASHBOARD_STATS: 300, // 5 minutes
  
  /** Analytics summary cache */
  ANALYTICS_SUMMARY: 300, // 5 minutes
  
  /** Cloudinary configuration cache */
  CLOUDINARY_CONFIG: 60, // 1 minute
  
  /** Default cache TTL */
  DEFAULT: 300, // 5 minutes
} as const;

// ============================================================================
// Type Exports
// ============================================================================

export type QueryLimitKey = keyof typeof QUERY_LIMITS;
export type RetryConfigKey = keyof typeof RETRY_CONFIG;
export type CacheTTLKey = keyof typeof CACHE_TTL_SECONDS;
```

**Then update files:**

```typescript
// File: src/actions/clients.ts
// BEFORE:
const BCRYPT_ROUNDS = 10;

// AFTER:
import { BCRYPT_ROUNDS } from '@/lib/constants';
```

```typescript
// File: src/app/api/admin/clients/route.ts
// BEFORE:
const BCRYPT_ROUNDS = 10;

// AFTER:
import { BCRYPT_ROUNDS } from '@/lib/constants';
```

```typescript
// File: src/app/api/public/booking/route.ts
// BEFORE:
const MAX_RETRY = 5;
const BCRYPT_ROUNDS = 10;

// AFTER:
import { BCRYPT_ROUNDS, RETRY_CONFIG } from '@/lib/constants';
const MAX_RETRY = RETRY_CONFIG.BOOKING_CODE_GENERATION;
```

```typescript
// File: src/app/api/admin/stats/route.ts
// BEFORE:
take: 5,

// AFTER:
import { QUERY_LIMITS } from '@/lib/constants';
take: QUERY_LIMITS.RECENT_ITEMS,
```

```typescript
// File: src/app/api/admin/search/route.ts
// BEFORE:
take: 10,

// AFTER:
import { QUERY_LIMITS } from '@/lib/constants';
take: QUERY_LIMITS.SEARCH_RESULTS_PER_TYPE,
```

---

## Medium Effort (2-4 hours)

### 4. Extract Common Auth Check Pattern

**Priority:** MEDIUM  
**Effort:** 2 hours  
**Impact:** Reduce duplication across 15+ files

```typescript
// File: src/lib/actions/auth.ts (EXPAND EXISTING)

import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';
import { errorResponse, unauthorizedResponse } from '@/lib/api/response';
import type { NextResponse } from 'next/server';

/**
 * Require authenticated session for API routes
 * Throws error if not authenticated
 * 
 * @example
 * export async function GET(request: Request) {
 *   const session = await requireAuth();
 *   // session is guaranteed to exist here
 * }
 */
export async function requireAuth() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    throw new AuthenticationError('Unauthorized');
  }
  return session;
}

/**
 * Check authentication and return NextResponse if unauthorized
 * Use this pattern for routes that need early return
 * 
 * @example
 * export async function GET(request: Request) {
 *   const authResult = await checkAuth();
 *   if (authResult instanceof NextResponse) return authResult;
 *   // authResult is Session here
 * }
 */
export async function checkAuth() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return errorResponse('Unauthorized', 401);
  }
  return session;
}

/**
 * Require admin role
 */
export async function requireAdmin() {
  const session = await requireAuth();
  if (session.user.role !== 'ADMIN') {
    throw new AuthorizationError('Admin access required');
  }
  return session;
}

/**
 * Custom error classes for better error handling
 */
export class AuthenticationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthenticationError';
  }
}

export class AuthorizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthorizationError';
  }
}
```

**Update route files:**

```typescript
// File: src/app/api/admin/clients/route.ts

// BEFORE:
async function checkAuth() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return errorResponse('Unauthorized', 401);
  }
  return session;
}

export async function GET(request: Request) {
  try {
    const auth = await checkAuth();
    if (auth instanceof NextResponse) return auth;
    // ... rest
  }
}

// AFTER:
import { checkAuth } from '@/lib/actions/auth';

export async function GET(request: Request) {
  try {
    const auth = await checkAuth();
    if (auth instanceof NextResponse) return auth;
    // ... rest
  }
}
```

---

### 5. Create Pagination Validation Wrapper

**Priority:** MEDIUM  
**Effort:** 1 hour  
**Impact:** Reduce duplication across 10+ files

```typescript
// File: src/types/pagination.ts (ADD TO EXISTING)

import { errorResponse } from '@/lib/api/response';
import type { NextResponse } from 'next/server';

/**
 * Parse and validate admin pagination parameters
 * Returns NextResponse error if validation fails
 * 
 * @example
 * export async function GET(request: Request) {
 *   const { searchParams } = new URL(request.url);
 *   const paginationResult = requireAdminPagination(searchParams);
 *   if (paginationResult instanceof NextResponse) return paginationResult;
 *   
 *   const { page, limit, skip } = paginationResult;
 *   // ... use pagination
 * }
 */
export function requireAdminPagination(searchParams: URLSearchParams) {
  const result = parseAdminPaginationSafe(searchParams);
  
  if (!result.success) {
    const firstError = result.error.errors[0];
    return errorResponse(
      `${firstError.path.join('.')}: ${firstError.message}`,
      400
    );
  }
  
  return result.data;
}

/**
 * Parse and validate cursor pagination parameters
 */
export function requireCursorPagination(searchParams: URLSearchParams) {
  const result = parseCursorSafe(searchParams);
  
  if (!result.success) {
    return errorResponse(result.error.errors[0].message, 400);
  }
  
  return result.data;
}
```

**Update route files:**

```typescript
// File: src/app/api/admin/clients/route.ts

// BEFORE:
const paginationResult = parseAdminPaginationSafe(searchParams);
if (!paginationResult.success) {
  const firstError = paginationResult.error.errors[0];
  return errorResponse(`${firstError.path.join('.')}: ${firstError.message}`, 400);
}
const { page, limit, skip } = paginationResult.data;

// AFTER:
import { requireAdminPagination } from '@/types/pagination';

const paginationResult = requireAdminPagination(searchParams);
if (paginationResult instanceof NextResponse) return paginationResult;
const { page, limit, skip } = paginationResult;
```

---

### 6. Fix setInterval in Rate Limiter

**Priority:** MEDIUM  
**Effort:** 30 minutes  
**Impact:** Serverless compatibility

```typescript
// File: src/lib/rate-limit.ts

// BEFORE (lines 88-95):
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of memoryStore.entries()) {
    if (entry.resetAt < now) {
      memoryStore.delete(key);
    }
  }
}, 5 * 60 * 1000);

// AFTER:
/**
 * Clean up expired entries from in-memory store
 * Called on-demand instead of using setInterval (serverless-friendly)
 */
function cleanupExpiredEntries() {
  const now = Date.now();
  let cleaned = 0;
  
  for (const [key, entry] of memoryStore.entries()) {
    if (entry.resetAt < now) {
      memoryStore.delete(key);
      cleaned++;
    }
  }
  
  return cleaned;
}

function checkRateLimitMemory(
  identifier: string,
  config: RateLimitConfig
): { success: boolean; remaining: number; resetAt: number } {
  // Clean up expired entries on every check (serverless-friendly)
  // This is only used as fallback when Redis is unavailable
  cleanupExpiredEntries();
  
  const now = Date.now();
  const key = identifier;
  
  // ... rest of implementation
}
```

**Optional: Add Vercel Cron for periodic cleanup**

```json
// File: vercel.json (ADD)
{
  "crons": [
    {
      "path": "/api/cron/cleanup-rate-limits",
      "schedule": "*/5 * * * *"
    }
  ]
}
```

```typescript
// File: src/app/api/cron/cleanup-rate-limits/route.ts (NEW)
import { NextResponse } from 'next/server';

/**
 * Cron endpoint to clean up expired rate limit entries
 * Runs every 5 minutes via Vercel Cron
 */
export async function GET(request: Request) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  // Cleanup logic would go here if needed
  // Currently handled on-demand in checkRateLimitMemory
  
  return NextResponse.json({ success: true, message: 'Cleanup completed' });
}
```

---

## Low Priority (Nice to Have)

### 7. Add Runtime Validation for FormData

**Priority:** LOW  
**Effort:** 30 minutes  
**Impact:** Better error messages

```typescript
// File: src/app/api/admin/galleries/[id]/photos/route.ts

// BEFORE (lines 124-126):
const file = formData.get('file') as File;
const cloudinaryAccountId = formData.get('cloudinaryAccountId') as string | null;
const r2AccountId = formData.get('r2AccountId') as string | null;

// AFTER:
const fileEntry = formData.get('file');
if (!fileEntry || !(fileEntry instanceof File)) {
  return errorResponse('File is required and must be a valid file', 400);
}
const file = fileEntry;

const cloudinaryAccountId = formData.get('cloudinaryAccountId') as string | null;
const r2AccountId = formData.get('r2AccountId') as string | null;

// Validate at least one storage account is provided
if (!cloudinaryAccountId && !r2AccountId) {
  return errorResponse('At least one storage account must be specified', 400);
}
```

---

### 8. Improve Environment Variable Typing

**Priority:** LOW  
**Effort:** 1 hour  
**Impact:** Better type safety for env vars

```typescript
// File: src/lib/env.ts

// BEFORE (line 28):
const parsed = typeof window === 'undefined' 
  ? envSchema.safeParse(process.env) 
  : ({ success: true, data: process.env as unknown as z.infer<typeof envSchema> } as z.SafeParseSuccess<...>);

// AFTER:
// Server-side: validate with Zod
// Client-side: only expose NEXT_PUBLIC_ vars (already validated at build time)
const parsed = typeof window === 'undefined' 
  ? envSchema.safeParse(process.env)
  : {
      success: true as const,
      data: {
        // Only include NEXT_PUBLIC_ vars for client
        NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
        NEXT_PUBLIC_ABLY_CHANNEL_PREFIX: process.env.NEXT_PUBLIC_ABLY_CHANNEL_PREFIX || 'photostudio',
        // Server-only vars are undefined on client (type-safe)
        DATABASE_URL: undefined as unknown as string,
        NEXTAUTH_SECRET: undefined as unknown as string,
        NEXTAUTH_URL: undefined as unknown as string,
        // ... other server-only vars
      } satisfies Partial<z.infer<typeof envSchema>>,
    };

if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors);
  throw new Error('Invalid environment configuration');
}

export const env = parsed.data;
```

---

### 9. Add JSDoc for Complex Type Assertions

**Priority:** LOW  
**Effort:** 1 hour  
**Impact:** Better code documentation

```typescript
// File: src/lib/storage/rotation.ts

// BEFORE (line 85):
history = account.rotationHistory as unknown as RotationHistoryEntry[];

// AFTER:
/**
 * Prisma stores JSON fields as `Prisma.JsonValue`, which is a union type
 * that includes `null`. We know from the schema that `rotationHistory`
 * is always an array when present, so we safely cast it here.
 * 
 * Type: Prisma.JsonValue -> RotationHistoryEntry[]
 */
history = account.rotationHistory as unknown as RotationHistoryEntry[];
```

```typescript
// File: src/lib/cloudflare-queue.ts

// BEFORE (line 745):
new Set(photos.map((p) => p.storageAccountId).filter(Boolean) as string[])

// AFTER:
/**
 * Filter out null/undefined storageAccountIds, then assert as string[]
 * since filter(Boolean) removes falsy values but TypeScript doesn't narrow
 * the type automatically.
 */
new Set(
  photos
    .map((p) => p.storageAccountId)
    .filter((id): id is string => Boolean(id))
)
```

---

## Testing Recommendations

### 10. Add Test Coverage for Critical Modules

**Priority:** LOW  
**Effort:** 4-8 hours  
**Impact:** Confidence in refactoring

```typescript
// File: src/lib/bigint-utils.test.ts (NEW)

import { describe, it, expect } from 'vitest';
import { serializeBigInt, stringifyWithBigInt, bigIntToNumber } from './bigint-utils';

describe('serializeBigInt', () => {
  it('converts BigInt to string', () => {
    expect(serializeBigInt(1024n)).toBe('1024');
  });

  it('handles nested objects with BigInt', () => {
    const input = { fileSize: 1024n, nested: { count: 5n } };
    const expected = { fileSize: '1024', nested: { count: '5' } };
    expect(serializeBigInt(input)).toEqual(expected);
  });

  it('preserves Date objects', () => {
    const date = new Date('2026-05-13');
    const input = { createdAt: date, size: 100n };
    const result = serializeBigInt(input);
    expect(result.createdAt).toBeInstanceOf(Date);
    expect(result.createdAt).toEqual(date);
  });

  it('handles arrays with BigInt', () => {
    const input = [1n, 2n, 3n];
    const expected = ['1', '2', '3'];
    expect(serializeBigInt(input)).toEqual(expected);
  });
});

describe('bigIntToNumber', () => {
  it('converts safe BigInt to number', () => {
    expect(bigIntToNumber(1024n)).toBe(1024);
  });

  it('throws on overflow', () => {
    expect(() => bigIntToNumber(BigInt(Number.MAX_SAFE_INTEGER) + 1n))
      .toThrow('exceeds safe integer range');
  });
});
```

```typescript
// File: src/lib/api/validation.test.ts (NEW)

import { describe, it, expect } from 'vitest';
import { clientSchema, eventSchema } from './validation';

describe('clientSchema', () => {
  it('validates correct client data', () => {
    const data = {
      nama: 'John Doe',
      email: 'john@example.com',
      password: 'securepass123',
      phone: '081234567890',
    };
    
    const result = clientSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('sanitizes XSS attempts', () => {
    const data = {
      nama: 'John<script>alert("xss")</script>',
      email: 'john@example.com',
      password: 'securepass123',
    };
    
    const result = clientSchema.safeParse(data);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.nama).not.toContain('<script>');
    }
  });

  it('rejects invalid email', () => {
    const data = {
      nama: 'John Doe',
      email: 'invalid-email',
      password: 'securepass123',
    };
    
    const result = clientSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('rejects short password', () => {
    const data = {
      nama: 'John Doe',
      email: 'john@example.com',
      password: 'short',
    };
    
    const result = clientSchema.safeParse(data);
    expect(result.success).toBe(false);
  });
});
```

---

## Migration Plan

### Phase 1: Quick Wins (Week 1)
1. Remove development console.log statements
2. Fix `as any` type assertion
3. Create centralized constants file
4. Update 5-10 files to use new constants

**Estimated Time:** 3-4 hours  
**Risk:** Very Low  
**Impact:** Immediate code quality improvement

### Phase 2: Reduce Duplication (Week 2)
1. Extract auth check pattern
2. Create pagination validation wrapper
3. Update all route files to use new utilities
4. Fix setInterval in rate limiter

**Estimated Time:** 4-6 hours  
**Risk:** Low (well-tested patterns)  
**Impact:** Significant reduction in duplication

### Phase 3: Polish (Week 3-4)
1. Add runtime validation for FormData
2. Improve environment variable typing
3. Add JSDoc for complex assertions
4. Add test coverage for critical modules

**Estimated Time:** 8-12 hours  
**Risk:** Low  
**Impact:** Better maintainability and confidence

---

## Rollback Plan

All changes are backward compatible and can be rolled back individually:

1. **Constants extraction:** Keep old constants, gradually migrate
2. **Auth utilities:** Keep old checkAuth functions, migrate route by route
3. **Pagination wrapper:** Optional adoption, old pattern still works
4. **Console.log removal:** Can be re-added if needed for debugging

**No breaking changes to public APIs or database schema.**

---

## Success Metrics

- [ ] Zero `as any` type assertions in production code
- [ ] < 10 console.log statements in client-side code
- [ ] Zero duplicated BCRYPT_ROUNDS constants
- [ ] Zero duplicated auth check functions
- [ ] Zero setInterval in serverless-deployed code
- [ ] 80%+ test coverage for utility modules
- [ ] All magic numbers extracted to named constants

---

## Maintenance Guidelines

### Adding New Constants
```typescript
// Always add to src/lib/constants.ts with JSDoc
/** Description of what this constant controls */
export const NEW_CONSTANT = value;
```

### Adding New Routes
```typescript
// Always use shared utilities
import { checkAuth } from '@/lib/actions/auth';
import { requireAdminPagination } from '@/types/pagination';
import { QUERY_LIMITS } from '@/lib/constants';
```

### Logging Best Practices
```typescript
// Server-side: Use structured logging
console.log('[Module] Action:', { context });

// Client-side: Only in development
if (process.env.NODE_ENV === 'development') {
  console.log('[Debug]', data);
}

// Production: Use logger utility
import { logger } from '@/lib/logger';
logger.info('Action completed', { userId, action });
```
