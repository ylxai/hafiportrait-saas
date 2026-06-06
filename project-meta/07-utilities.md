# PhotoStudio SaaS — Utilities & Reusable Code

> Helper functions, hooks, and shared utilities you WILL need.

---

## 1. Response Helpers (`src/lib/api/response.ts`)

| Helper | Returns | Notes |
|---|---|---|
| `successResponse(data, status?)` | `{ success: true, data }` | Auto serializes BigInt via `serializeBigInt()` |
| `errorResponse(message, status?)` | `{ success: false, error }` | `400` default |
| `serverErrorResponse(message?)` | `{ success: false, error }` | `500` |
| `unauthorizedResponse()` | `{ success: false, error }` | `401` |
| `forbiddenResponse()` | `{ success: false, error }` | `403` |
| `notFoundResponse()` | `{ success: false, error }` | `404` |
| `paginatedResponse(data, pagination)` | `{ success: true, data, pagination }` | Page/limit/total |
| `getClientIp(request)` | `string` | Extracts client IP from X-Forwarded-For |

---

## 2. Validation Schemas (`src/lib/api/validation.ts`)

```typescript
import { 
  idSchema,
  paginationSchema,         // page (default 1), limit (default 20, max 100)
  searchQuerySchema,        // q (min 1, max 200), type (optional enum)
  
  // Entity schemas
  clientSchema,             // Client CRUD validation
  packageSchema,            // Package create/update
  eventSchema,              // Event create/update
  gallerySchema,            // Gallery settings
  bookingSchema,            // Public booking form
  paymentProofSchema,       // Payment proof upload
  selectionSubmitSchema,    // Gallery selection submit
  
  // URL params
  tokenParamsSchema,        // { token: string }
  tokenPhotoParamsSchema,   // { token, photoId }
  kodeBookingParamsSchema,  // { kodeBooking: string }
  clientReconcileQuerySchema,
} from '@/lib/api/validation'

// Format errors
import { formatZodError } from '@/lib/api/validation'
```

---

## 3. Constants (`src/lib/api/constants.ts`)

```typescript
// HTTP Status codes
HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  INTERNAL_SERVER_ERROR: 500,
  NOT_IMPLEMENTED: 501,
}

// File size/format limits
MAX_FILE_SIZE = 50 * 1024 * 1024  // 50MB
ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']
```

---

## 4. BigInt Serialization (`src/lib/bigint-utils.ts`)

```typescript
import { serializeBigInt } from '@/lib/bigint-utils'

// ✅ Safe for JSON serialization
const data = { fileSize: BigInt(1024) }
return successResponse(serializeBigInt(data))
// → { fileSize: "1024" }
```

---

## 5. Logger (`src/lib/logger.ts`)

```typescript
import { logger } from '@/lib/logger'

logger.debug('upload.start', { galleryId, count: 5 })
logger.info('user.login', { email, role: 'admin' })
logger.warn('auth.failed', { email, reason: 'invalid_password' })
logger.error('storage.r2.delete_failed', { key, err })
```

**CRITICAL**: `logger` uses `node:async_hooks` — only works in **Node runtime** (API routes). In Edge/browser code, use `console.*` (by design).

---

## 6. Auth Guards (`src/lib/auth/`)

```typescript
import { requireAdminAuth } from '@/lib/auth/require-admin-auth'
import { requireClientAuth } from '@/lib/auth/require-client-auth'
import { isAdminSession, isClientSession } from '@/lib/auth/role-helpers'

// Route level
const auth = await requireAdminAuth()
if (auth instanceof NextResponse) return auth
```

---

## 7. Request Context & Tracing

```typescript
import { withRequestContext } from '@/lib/with-request-context'
import { getRequestId } from '@/lib/request-context'

// Wrap route for auto request-id injection
export default withRequestContext(async (req: NextRequest) => {
  const requestId = getRequestId()  // From x-request-id header
  logger.info('request', { requestId, path: req.url })
})
```

---

## 8. Custom Hooks (`src/lib/hooks/`)

### `useAbly`
Ably realtime connection hook for gallery live updates.

```typescript
import { useAblyChannel } from '@/lib/hooks/useAbly'

const { publish } = useAblyChannel('gallery-123')
publish({ type: 'photo-uploaded', photoId: 'abc' })
```

---

## 9. Rate Limiting (`src/lib/rate-limit.ts`)

```typescript
import { rateLimit } from '@/lib/rate-limit'

const limiter = rateLimit({ requests: 10, window: '1m' })
const result = await limiter.check(req)

if (!result.success) {
  return errorResponse('Too many requests', 429)
}
```

---

## 10. Webhook Validation (`src/lib/webhook-validation.ts`)

```typescript
import { validateWebhook } from '@/lib/webhook-validation'

export async function POST(req: Request) {
  const isValid = await validateWebhook(req, 'VPS_WEBHOOK_SECRET')
  if (!isValid) return unauthorizedResponse('Invalid webhook secret')
}
```

---

## 11. Utility Functions (`src/lib/utils.ts`)

- `cn(...inputs)` — Tailwind class merge (clsx + tailwind-merge)
- `formatDate(date, options?)` — Intl.DateTimeFormat wrapper
- `formatCurrency(amount, currency?)` — Currency formatter
- `slugify(str)` — URL-safe slug generator
- `truncate(str, maxLen)` — String truncation with ellipsis
- `debounce(fn, delay)` — Debounce wrapper
- `generateUniqueCode()` — Random 3-digit code for payment verification
