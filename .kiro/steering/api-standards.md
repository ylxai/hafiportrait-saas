# API Standards

## Route Structure
- Admin APIs: `/api/admin/[resource]` — auth required
- Public APIs: `/api/public/[resource]` — no auth
- Webhooks: `/api/webhook/[event]` — secret verification

## Response Format
Semua responses WAJIB menggunakan helpers dari `src/lib/api/response.ts`:

```typescript
// Success
return successResponse({ key: value })
// → { success: true, data: { key: value } }

// Paginated
return paginatedResponse(items, { page: 1, limit: 20, total: 100 })
// → { success: true, data: { items: [...] }, pagination: { page, limit, total, pages } }

// Errors
return errorResponse('Message', 400)
return unauthorizedResponse()   // 401
return notFoundResponse()       // 404
return serverErrorResponse()    // 500
return validationError(errors)  // 422
```

## Pagination
```typescript
// Query params: ?page=1&limit=20
const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
const limit = Math.min(100, parseInt(searchParams.get('limit') ?? '20', 10))
const skip = (page - 1) * limit
```

## BigInt Serialization
```typescript
// Prisma BigInt TIDAK bisa JSON.stringify langsung
// WAJIB convert ke string:
return successResponse({
  usedStorage: account.usedStorage.toString(),
  fileSize: photo.fileSize?.toString()
})
// Atau gunakan helper dari src/lib/bigint-utils.ts
```

## Zod Validation Pattern
```typescript
import { z } from 'zod'

const schema = z.object({
  name: z.string().min(1).max(255),
  date: z.string().datetime(),  // WAJIB untuk date fields
  limit: z.number().int().min(1).max(100).default(20)
})

const result = schema.safeParse(body)
if (!result.success) return validationError(result.error.flatten())
```

## Auth Check Pattern
```typescript
async function checkAuth() {
  const session = await getServerSession(authOptions)
  if (!session) return unauthorizedResponse()
  return session
}
```

## Cloudflare Queue Integration
```typescript
// Untuk background jobs, gunakan src/lib/cloudflare-queue.ts
import { queueStorageDeletion } from '@/lib/cloudflare-queue'
await queueStorageDeletion({ photoId, r2Key, cloudinaryPublicId })
```
