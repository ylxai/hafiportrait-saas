# Product Overview

**PhotoStudio SaaS** — Platform manajemen foto profesional untuk fotografer.

## Target Users
- Fotografer profesional yang butuh manajemen galeri klien
- Klien yang menerima dan menyeleksi foto hasil pemotretan

## Core Features
- **Upload System**: Direct upload ke Cloudflare R2 (bypass server), thumbnail via Cloudinary
- **Gallery Management**: Galeri per klien dengan public token access (no auth required)
- **Client & Event Management**: Admin dashboard untuk kelola klien, event, paket
- **Booking System**: Public booking form untuk klien baru
- **Real-time Notifications**: Via Ably (upload progress, selection updates, payment status)
- **Storage Management**: Multi-account R2/Cloudinary dengan key rotation otomatis
- **Finance Tracking**: Laporan keuangan per event/klien

## Business Rules
- Galeri diakses via unique token (bukan auth) — URL shareable ke klien
- Storage credentials disimpan di database (bukan .env) — multi-account support
- Background jobs (delete foto, generate thumbnail) via Cloudflare Queues — tidak blocking API
- Foto deletion: hapus dari DB dulu, cleanup storage di-queue async
