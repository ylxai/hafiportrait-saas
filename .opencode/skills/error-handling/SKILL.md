---
name: error-handling
description: Error handling patterns and practices
license: MIT
compatibility: opencode
---

# Error Handling

## Use Sonner for Notifications
```typescript
import { toast } from 'sonner'

// Success
toast.success('Operation completed')

// Error
toast.error('Something went wrong')

// Info
toast.info('Please wait...')
```

## NEVER Use
- alert()
- console.error() for user errors

## API Error Handling
```typescript
try {
  const result = await doSomething()
  return successResponse(result)
} catch (error) {
  console.error(error) // For logging
  return errorResponse(error.message)
}
```

## Zod Validation Errors
```typescript
const validated = schema.safeParse(data)
if (!validated.success) {
  return errorResponse(validated.error.errors)
}
```