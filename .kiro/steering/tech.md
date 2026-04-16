# Technology Stack

## Core Framework
- **Next.js 15.4.11** (App Router) — BREAKING CHANGES dari versi sebelumnya
  - Route `params` dan `searchParams` HARUS di-await sebagai Promise sebelum destructure
  - Baca `node_modules/next/dist/docs/` sebelum menulis kode baru
- **TypeScript** — strict mode, NO `any`, gunakan `unknown` atau interface spesifik
- **Tailwind CSS v4** — OKLCH semantic colors, NO `rgba(var(--primary))` syntax

## UI Components
- **@base-ui/react** — Dialog, Popover, Select, Drawer (BUKAN Radix UI)
- **shadcn/ui** — komponen base di `src/components/ui/`
- **Lucide React** — icons
- **Sonner** — toast notifications (BUKAN `alert()`)

## Database & ORM
- **PostgreSQL** via **Prisma** ORM
- BigInt fields HARUS di-serialize ke string di API responses
- Gunakan `prisma.$queryRaw` untuk query kompleks (analytics, aggregation)

## Storage
- **Cloudflare R2** — original files (presigned URL direct upload)
- **Cloudinary** — thumbnails only
- Credentials dari `StorageAccount` table di DB, BUKAN dari `.env`

## Background Jobs
- **Cloudflare Queues + Cloudflare Workers** — SATU-SATUNYA cara background jobs
- NO BullMQ, NO PM2, NO Redis untuk task queues
- `ioredis`/Valkey HANYA untuk caching layer

## Real-time
- **Ably** — WebSocket untuk notifikasi real-time

## Auth
- **NextAuth.js** — session-based auth untuk admin
- Semua `/api/admin/*` WAJIB cek `getServerSession()`

## Dev Tools
- **ESLint** — `npm run lint`
- **Playwright** — E2E testing (via MCP, bukan script manual)
- Build check: `npm run lint && npm run build`
