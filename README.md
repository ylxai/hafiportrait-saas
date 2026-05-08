# PhotoStudio SaaS

Professional photo management platform for photographers.

## Features

- **Photo Management** - Upload, organize, and manage professional photos
- **Client Galleries** - Share password-protected galleries with clients
- **Cloud Storage** - Cloudflare R2 for originals, Cloudinary for thumbnails
- **Real-time Updates** - Ably for live notifications

## Tech Stack

- **Next.js 15.4.11** with App Router
- **TypeScript** (strict mode)
- **Tailwind v4** with OKLCH
- **Prisma** + PostgreSQL
- **Cloudflare R2** + Cloudinary
- **Ably** for real-time

## Quick Start

```bash
# Install dependencies
npm install

# Setup database
npm run db:push
npm run db:generate

# Start development
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Dev Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Development server (port 3000) |
| `npm run build` | Production build |
| `npm run lint` | Run ESLint |
| `npm run db:push` | Push Prisma schema |
| `npm run db:generate` | Generate Prisma client |

## Project Structure

```
src/
├── app/
│   ├── (dashboard)/admin/   # Admin dashboard
│   ├── gallery/[token]/     # Public galleries
│   └── api/                 # API routes
├── components/ui/           # UI components
└── lib/                     # Utilities
├── workers/                 # Cloudflare Workers
└── prisma/                  # Database schema
```

## Environment Variables

```env
DATABASE_URL=postgresql://...
CLOUDFLARE_API_TOKEN=...
ABLY_API_KEY=...
NEXTAUTH_SECRET=...
VPS_WEBHOOK_SECRET=...
```

See `.env.example` for full list.

## Architecture

- **Storage**: R2 for originals (presigned URL upload), Cloudinary for thumbnails
- **Auth**: NextAuth.js with credentials provider
- **Background**: Cloudflare Queues for thumbnail generation
- **Real-time**: Ably channel for live updates

## Verification

Before committing:

```bash
npm run lint && npm run build
```

## Documentation

- [AGENTS.md](./AGENTS.md) - AI agent configuration
- [CLAUDE.md](./CLAUDE.md) - Claude Code specific rules
- `docs/` - Additional documentation

## License

MIT