---
name: nextjs-best-practices
description: Next.js 15 best practices and patterns
license: MIT
compatibility: opencode
---

# Next.js Best Practices

## Project Stack
- Next.js 15.4.11
- React 19
- TypeScript (strict)

## Important Rules

### Route Parameters
ALWAYS await params before destructuring:
```typescript
// ❌ Wrong
export default function Page({ params }: { params: { id: string } }) {
  return <div>{params.id}</div>
}

// ✅ Correct
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <div>{id}</div>
}
```

### Data Fetching
- Use async/await in Server Components
- Use Server Actions for mutations
- Use SWR for client-side data

### API Routes
- Located in src/app/api/*
- Use response helpers from src/lib/api/response.ts
- Validate with Zod

### Environment Variables
- Never commit secrets
- Use .env.local for local development
- Add .env to .gitignore

## File Structure
```
src/app/
├── (dashboard)/    # Protected routes (auth required)
├── api/            # API routes
│   ├── admin/      # Admin-only endpoints
│   ├── public/     # Public endpoints
│   └── webhook/    # Webhook handlers
└── gallery/        # Public gallery routes
```