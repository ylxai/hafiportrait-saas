---
name: rest-api-standards
description: REST API design and response patterns
license: MIT
compatibility: opencode
---

# REST API Standards

## Response Helpers
Use from `@/lib/api/response.ts`:
```typescript
successResponse(data)
errorResponse(message, code)
unauthorizedResponse()
notFoundResponse(resource)
paginatedResponse(data, page, limit, total)
```

## Pagination
```typescript
const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
const limit = Math.min(100, parseInt(searchParams.get('limit') ?? '20', 10))
```

## HTTP Status Codes
- 200: Success
- 201: Created
- 400: Bad Request
- 401: Unauthorized
- 403: Forbidden
- 404: Not Found
- 500: Server Error

## Best Practices
- Always validate input with Zod
- Return consistent response format
- Use proper HTTP methods
- Version APIs if breaking changes possible