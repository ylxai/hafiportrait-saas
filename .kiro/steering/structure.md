# Project Structure

## Directory Layout

```
src/
├── app/
│   ├── (auth)/login/          # Login page
│   ├── (dashboard)/admin/     # Admin pages (REQUIRE auth)
│   │   ├── analytics/
│   │   ├── clients/
│   │   ├── events/[id]/
│   │   ├── finance/
│   │   ├── galleries/[id]/
│   │   ├── packages/
│   │   ├── settings/
│   │   └── storage/
│   ├── api/
│   │   ├── admin/             # Admin APIs (auth required)
│   │   ├── public/            # Public APIs (no auth)
│   │   └── webhook/           # Cloudflare Worker webhooks
│   ├── booking/               # Public booking form
│   └── gallery/[token]/       # Public gallery (no auth, token-based)
├── components/
│   ├── photo/                 # Photo-specific components
│   ├── ui/                    # shadcn/base-ui components
│   └── upload/                # Upload UI (UploadManager)
├── hooks/                     # React hooks (useDirectUpload, useAbly)
├── lib/
│   ├── api/                   # response.ts, validation.ts
│   ├── auth/                  # NextAuth options
│   ├── hooks/                 # useAbly
│   ├── storage/               # r2.ts, cloudinary.ts, accounts.ts, rotation.ts, deletion.ts
│   ├── upload/                # presigned.ts, analytics.ts, cleanup.ts, hash-client.ts
│   ├── ably.ts
│   ├── bigint-utils.ts
│   ├── cache.ts
│   ├── cloudflare-queue.ts
│   └── db.ts
├── types/                     # TypeScript types & interfaces
└── middleware.ts              # Auth middleware
workers/                       # Cloudflare Edge Workers
prisma/
├── schema.prisma
└── seed.ts
docs/                          # EXCLUDED from build — docs only
```

## Naming Conventions
- Pages: `page.tsx`, layouts: `layout.tsx`
- API routes: `route.ts`
- Components: PascalCase (`UploadManager.tsx`)
- Hooks: camelCase dengan prefix `use` (`useDirectUpload.ts`)
- Lib files: kebab-case (`bigint-utils.ts`)

## Import Patterns
- Gunakan `@/` alias untuk semua imports dari `src/`
- Contoh: `import { successResponse } from '@/lib/api/response'`

## API Response Pattern
```typescript
// Selalu gunakan helpers dari src/lib/api/response.ts
return successResponse({ data: result })
return errorResponse('Message', 400)
return unauthorizedResponse()
return notFoundResponse()

// Pagination response
return paginatedResponse(data, { page, limit, total })
```
