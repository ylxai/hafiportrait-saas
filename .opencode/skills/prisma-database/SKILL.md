---
name: prisma-database
description: Prisma schema and database operations
license: MIT
compatibility: opencode
---

# Prisma Database

## Schema Location
- `prisma/schema.prisma`

## Common Commands
```bash
npm run db:generate   # Generate Prisma client
npm run db:push       # Push schema to DB
npm run db:seed       # Seed database
```

## Important Patterns

### BigInt Serialization
Prisma BigInt cannot JSON.stringify - always convert:
```typescript
// ❌ Wrong
return { id: user.id }

// ✅ Correct
return { id: user.id.toString() }
```

### Not Found (P2025)
Handle Prisma not found errors:
```typescript
try {
  const user = await prisma.user.findUnique({ where: { id } })
} catch (e) {
  if (e.code === 'P2025') return notFoundResponse('User not found')
}
```

### Queries
- Always paginate
- Use select to limit fields
- Don't fetch unnecessary relations