# Client Portal / Self-Service Dashboard

> Security fix + feature upgrade. Tutup celah token-based gallery + tambah client auth + dashboard.

---

## Problem

Saat ini `/gallery/[clientToken]` public. **Siapa pun pegang link bisa:** lihat foto, pilih/seleksi, submit & lock gallery. Tidak ada identitas, tidak ada audit trail.

**Solusi:** Client wajib auth sebelum akses gallery. Tambah portal dashboard self-service.

---

## Dampak ke Struktur Code

| Area | Dampak |
|------|--------|
| Prisma schema | Tambah 4 field di Client |
| NextAuth | Tambah 1 provider client |
| Middleware | `/gallery` jadi protected |
| API baru | `src/app/api/portal/*` |
| Pages baru | `src/app/(portal)/*` |
| Admin code | Tidak disentuh |
| Worker, storage | Tidak disentuh |

---

## Phase 1: Client Auth 🔴 P0

> Tutup celah keamanan. 4 jam.

### Task 1.1 — Field auth di Client model (10m)
File: `prisma/schema.prisma`

Tambah 4 field ke model Client:
- `password String?` (hashed, null = magic link only)
- `emailVerified Boolean @default(false)`
- `verificationToken String?`
- `tokenExpiry DateTime?`

Jalanin `npx prisma db push`.

### Task 1.2 — Magic link auth API (60m)
Dependency: `npm install resend jsonwebtoken`

File baru:
- `src/lib/auth/magic-link.ts` — generate JWT token + kirim via Resend + verify
- `src/app/api/portal/auth/magic-link/route.ts` — POST { email } → cari client → kirim magic link
- `src/app/api/portal/auth/verify/route.ts` — POST { token } → verify JWT + DB → return clientId

Flow: client input email → dapat link di email → klik → verify token → signIn NextAuth

### Task 1.3 — NextAuth client provider (30m)
File: `src/lib/auth/options.ts`

Tambah CredentialsProvider `id: 'client'`:
- Credentials: clientId + email
- Authorize: lookup Client di DB, verify email match
- Return: `{ id, email, name, role: 'CLIENT' }`

### Task 1.4 — Client login page (30m)
File baru: `src/app/(portal)/login/page.tsx`

- Form input email + tombol "Kirim Link Masuk"
- Setelah kirim: tampilkan "Cek Email Anda"
- Error handling: email tidak ditemukan, gagal kirim

### Task 1.5 — Verify magic link page (20m)
File baru: `src/app/(portal)/verify/page.tsx`

- Ambil `?token=` dari URL
- POST ke `/api/portal/auth/verify`
- Sukses → signIn('client', { clientId, email }) → redirect ke /portal/dashboard
- Gagal → tampilkan error, minta link baru

### Task 1.6 — Update middleware (30m)
File: `src/middleware.ts`

- Hapus `/gallery` dari publicRoutes
- Tambah `/portal/login`, `/portal/verify`, `/api/portal/auth` ke publicRoutes
- Tambah handler baru: semua `/gallery/*` + `/portal/*` + `/api/portal/gallery/*` wajib session CLIENT
- Kalau belum login → redirect ke `/portal/login?callbackUrl=...`

### Task 1.7 — Portal gallery API (45m)
Copy dari public API + tambah auth & ownership check.

File baru:
- `src/app/api/portal/gallery/[token]/route.ts`
- `src/app/api/portal/gallery/[token]/submit/route.ts`

Di GET handler:
- `getServerSession()` → role !== 'CLIENT' → 401
- Setelah gallery ditemukan → cek `gallery.event.clientId !== session.user.id` → 403

Di submit handler:
- Auth check sama
- Simpan `clientId` + `clientName` ke Ably event (audit trail)

### Task 1.8 — Update gallery page endpoint (15m)
File: `src/app/gallery/[token]/page.tsx`

Ganti semua fetch:
- `/api/public/gallery/...` → `/api/portal/gallery/...`
- Publikasikan clientId ke Ably selection update

---

## Phase 2: Portal Dashboard MVP 🟡 P1

> Client bisa lihat semua gallery dalam satu dashboard. 4 jam.

### Task 2.1 — Portal route group + layout (60m)
File baru: `src/app/(portal)/layout.tsx`

- Header: logo + nama client + tombol keluar
- Sidebar nav (desktop): Dashboard, Tagihan, Profil
- Bottom nav (mobile): icon-only compact
- `useSession()` untuk data client

### Task 2.2 — Dashboard API (20m)
File baru: `src/app/api/portal/dashboard/route.ts`

Query galleries where `event.clientId === session.user.id`:
- Include: event (namaProject, eventDate), _count (photos, selections)
- OrderBy: createdAt desc

Return `{ galleries, invoices }`

### Task 2.3 — Dashboard page (60m)
File baru: `src/app/(portal)/dashboard/page.tsx`

- Loading: spinner
- Empty: "Belum ada gallery" + info
- Cards grid: per gallery tampilkan cover, nama, jumlah foto, tanggal
- Badge "Baru!" kalau status published & belum ada selection
- Klik card → buka `/gallery/[clientToken]`

### Task 2.4 — Portal gallery detail (30m)
File baru: `src/app/(portal)/gallery/[id]/page.tsx`

Copy-paste dari gallery/[token] — identik, hanya beda:
- Endpoint pakai `/api/portal/gallery/[galleryId]`
- Auth sudah di-handle middleware

### Task 2.5 — Profile API + page (60m)
API: `src/app/api/portal/profile/route.ts` — PATCH nama, phone, instagram

Page: `src/app/(portal)/profile/page.tsx` — form sederhana edit profil

### Task 2.6 — Invoice read-only page (90m)
API: `src/app/api/portal/invoices/route.ts`

- GET payments where `event.clientId === session.user.id`
- Include event (namaProject, eventDate)
- Return: status (pending/approved/rejected), amount (Rp), type (dp/full)

Page: `src/app/(portal)/invoices/page.tsx`

- Card per payment: nama event, amount, status badge
- Hanya read-only — tidak ada tombol bayar
- Status color: pending (muted), approved (primary), rejected (destructive)
- Catatan: "Hubungi fotografer untuk pembayaran"

> Stripe payment integration di-skip untuk sekarang. Ditambahkan nanti saat siap.

---

## File Summary

### File Baru
```
src/app/(portal)/
├── layout.tsx
├── login/page.tsx
├── verify/page.tsx
├── dashboard/page.tsx
├── gallery/[id]/page.tsx
├── invoices/page.tsx
└── profile/page.tsx

src/app/api/portal/
├── auth/magic-link/route.ts
├── auth/verify/route.ts
├── dashboard/route.ts
├── gallery/[token]/route.ts
├── gallery/[token]/submit/route.ts
├── invoices/route.ts
└── profile/route.ts

src/lib/auth/magic-link.ts
```

### File Dimodifikasi
| File | Perubahan |
|------|-----------|
| `prisma/schema.prisma` | +4 field di Client |
| `src/middleware.ts` | /gallery protected, +portal handler |
| `src/lib/auth/options.ts` | +client CredentialsProvider |
| `src/app/gallery/[token]/page.tsx` | Endpoint ke portal API |
| `.env` | +RESEND_API_KEY, +NEXT_PUBLIC_URL |

---

## Progress Tracker

| # | Phase | Status | Task | Effort |
|---|-------|--------|------|--------|
| 1.1 | P0 🔴 | ⬜ | Field auth di Client model | 10m |
| 1.2 | P0 🔴 | ⬜ | Magic link auth API | 60m |
| 1.3 | P0 🔴 | ⬜ | NextAuth client provider | 30m |
| 1.4 | P0 🔴 | ⬜ | Client login page | 30m |
| 1.5 | P0 🔴 | ⬜ | Verify magic link page | 20m |
| 1.6 | P0 🔴 | ⬜ | Update middleware | 30m |
| 1.7 | P0 🔴 | ⬜ | Portal gallery API (mirror + auth) | 45m |
| 1.8 | P0 🔴 | ⬜ | Update gallery page endpoint | 15m |
| 2.1 | P1 🟡 | ⬜ | Portal route group + layout | 60m |
| 2.2 | P1 🟡 | ⬜ | Dashboard API | 20m |
| 2.3 | P1 🟡 | ⬜ | Dashboard page | 60m |
| 2.4 | P1 🟡 | ⬜ | Portal gallery detail (reuse) | 30m |
| 2.5 | P1 🟡 | ⬜ | Profile API + page | 60m |
| 2.6 | P1 🟡 | ⬜ | Invoice read-only page | 90m |

| Phase | Effort |
|-------|--------|
| P0 🔴 | 4 jam |
| P1 🟡 | 5.5 jam |
| **Total** | **~9.5 jam** |

---

*Generated 2026-05-01*