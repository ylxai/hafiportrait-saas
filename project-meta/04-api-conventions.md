# PhotoStudio SaaS — API Conventions & Helpers

> How API routes work, what helpers are available, and how to use them.

---

## 1. API Route Pattern

All API routes follow this boilerplate:

```typescript
import { NextRequest } from 'next/server'
import { requireAdminAuth } from '@/lib/auth/require-admin-auth'
import { successResponse, errorResponse, serverErrorResponse } from '@/lib/api/response'
import { formatZodError } from '@/lib/api/validation'
import { z } from 'zod'

bodySchema = z.object({
  field1: z.string().min(1),
  field2: z.number().positive(),
})

export async function POST(req: NextRequest) {
  // 1. Auth guard (admin routes only)
  const auth = await requireAdminAuth()
  if (auth instanceof NextResponse) return auth

  // 2. Body parsing
  let body
  try { body = await req.json() }
  catch { return errorResponse('Invalid JSON', 400) }

  // 3. Validation
  const result = bodySchema.safeParse(body)
  if (!result.success) {
    return errorResponse(formatZodError(result.error), 400)
  }

  // 4. Business logic
  try {
    const data = await prisma.someModel.create({ data: result.data })
    return successResponse(data, 201)
  } catch (err: unknown) {
    // Prisma P2025 = Record not found → 404
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
      return errorResponse('Not found', 404)
    }
    return serverErrorResponse('Failed to create')
  }
}
```

---

## 2. Response Helpers (`src/lib/api/response.ts`)

| Function | Signature | Returns |
|---|---|---|
| `successResponse(data, status?)` | `{ success: true, data }` | `200` (default), `201` for creation |
| `errorResponse(message, status?)` | `{ success: false, error }` | `400` (default), `404` for not-found |
| `unauthorizedResponse()` | `{ success: false, error }` | `401` |
| `forbiddenResponse()` | `{ success: false, error }` | `403` |
| `serverErrorResponse(message?)` | `{ success: false, error }` | `500` |
| `notFoundResponse()` | `{ success: false, error }` | `404` |
| `paginatedResponse(data, pagination)` | `{ success: true, data, pagination }` | `200` |

### `successResponse` — BigInt Safe
All `successResponse()` calls automatically run `serializeBigInt()` on data before JSON serialization.

---

## 3. Validation Helpers (`src/lib/api/validation.ts`)

### Zod Schemas (Built-in)
```typescript
import { 
  idSchema,                    // { id: string.trim().min(1) }
  paginationSchema,            // { page, limit } with defaults
  searchQuerySchema,           // { q, type? }
  clientSchema,                // Full client CRUD validation
  packageSchema,               // Package create/update
  eventSchema,                 // Event create/update
  gallerySchema,               // Gallery settings
  bookingSchema,               // Public booking form
  selectionSubmitSchema,       // Gallery selection submit
  paymentProofSchema,          // Payment proof upload
  tokenParamsSchema,           // { token: string } from URL params
  tokenPhotoParamsSchema,      // { token, photoId } from URL params
  kodeBookingParamsSchema,     // { kodeBooking: string }
} from '@/lib/api/validation'
```

### `formatZodError()`
Converts Zod validation errors into human-readable strings:
```typescript
const result = userSchema.safeParse(body)
if (!result.success) {
  return errorResponse(formatZodError(result.error), 400)
}
```

### Sanitization
- `sanitizeString(str: string)` — Removes control characters, dangerous URL protocols (`javascript:`, `data:`), XSS event handlers (`onclick=`)
- Applied to ALL user-visible string inputs before storage
- Does NOT HTML-escape (React handles that at render time)

---

## 4. Prisma Error Handling (`src/lib/prisma-error.ts`)

```typescript
import { isPrismaError, isNotFoundError, handlePrismaError } from '@/lib/prisma-error'

try {
  await prisma.user.delete({ where: { id } })
} catch (err: unknown) {
  if (isNotFoundError(err)) {
    return notFoundResponse()
  }
  if (isPrismaError(err)) {
    return serverErrorResponse(handlePrismaError(err))
  }
  throw err
}
```

### Know Prisma Errors
| Code | Meaning | Handler |
|---|---|---|
| `P2025` | Record not found | `404 notFoundResponse()` |
| `P2002` | Unique constraint | `409 conflictResponse()` |
| `P2014` | Relation violation | `400 errorResponse()` |
| `P2026` | Provided invalid value | `400 errorResponse()` |

---

## 5. Logger (`src/lib/logger.ts`)

### Usage
```typescript
import { logger } from '@/lib/logger'

logger.info('upload.complete', { galleryId, photoCount: 5 })
logger.warn('auth.failed', { email: 'wrong@example.com', reason: 'invalid_password' })
logger.error('storage.deletion_failed', { photoId, err })
```

### Features
- **Structured JSON**: One line per event, pipe-friendly to Datadog/Sentry
- **Request ID auto-injection**: Via `AsyncLocalStorage` (in Node runtime)
- **Edge runtime safe**: Gracefully degrades (no requestId) in Edge environment
- **Level**: `LOG_LEVEL` or `NODE_ENV` controlled

### Important Contexts for `logger`
- **Server-side routes**: Always use `logger` (not `console`)
- **Browser-compatible files** (cloudinary.ts, storage/accounts.ts): **Cannot** use `logger` → use `console.error` (has no `node:async_hooks`)

---

## 6. Request Context & Tracing

### Request ID
- Middleware generates/echoes `x-request-id` UUID header
- Logger auto-tags log lines with requestID
- All responses echo `x-request-id` header back to client

### AsyncLocalStorage (`src/lib/request-context.ts`)
DANGER: Only available in Node runtime (API routes). Edge/middleware will crash if imported directly.

```typescript
import { withRequestContext } from '@/lib/with-request-context'
import { getRequestId } from '@/lib/request-context'

// In route handler
export default withRequestContext(async (req: NextRequest) => {
  const requestId = getRequestId() // Auto-injected from middleware header
  logger.info('request.start', { path: req.url })
  // ...
})
```

---

## 7. Rate Limiting

Rate limit helper in `src/lib/rate-limit.ts`. Configured per-route via `next.config.js` or inline middleware checks.

Pattern for custom rate-limit middleware:
```typescript
import { rateLimit } from '@/lib/rate-limit'

const limiter = rateLimit({ requests: 10, window: '1m' })
export async function POST(req: NextRequest) {
  const limitResult = await limiter.check(req)
  if (!limitResult.success) {
    return errorResponse('Too many requests', 429)
  }
  // ...route logic
}
```
