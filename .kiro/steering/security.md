# Security Guidelines

## Authentication
- Semua `/api/admin/*` WAJIB cek `getServerSession()` di awal handler
- Gunakan helper `requireAuth()` atau `verifyAuth()` dari `src/lib/auth/api.ts`
- Public routes: `/api/public/*`, `/gallery/[token]`, `/booking`

## Secrets & Credentials
- **JANGAN PERNAH** commit API keys, tokens, passwords ke repository
- `.env`, `.dev.vars` ada di `.gitignore` — jangan override
- Storage credentials (R2, Cloudinary) HARUS dari `StorageAccount` table di DB
- Webhook secret (`VPS_WEBHOOK_SECRET`) WAJIB divalidasi sebelum proses webhook

## Input Validation
- Semua input WAJIB divalidasi dengan **Zod** schema
- Sanitasi input untuk mencegah XSS
- Date fields WAJIB ada validasi di Zod schema

## DoS Prevention
- Pagination limit WAJIB di-cap: `Math.min(limit, 100)`
- `parseInt` WAJIB dengan radix 10: `parseInt(value, 10)`
- Jangan fetch unbounded data (e.g., semua foto sekaligus)

## Webhook Security
```typescript
// Semua webhook dari Cloudflare Edge WAJIB verifikasi:
const secret = request.headers.get('x-webhook-secret')
if (secret !== process.env.VPS_WEBHOOK_SECRET) {
  return unauthorizedResponse()
}
```

## File Upload Security
- Validasi file type di client DAN server
- Allowed types: `.jpg`, `.jpeg`, `.png`, `.webp`, `.heic`, `.nef`, `.cr2`, `.arw`, `.dng`, `.raw`
- File size validation menggunakan BigInt

## Prisma Error Handling
- Selalu handle `P2025` (record not found) → return 404
- Jangan expose raw Prisma errors ke client
