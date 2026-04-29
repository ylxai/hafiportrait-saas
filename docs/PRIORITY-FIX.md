# Priority Fix Task List — Code Review 2026-04-29

> Hasil dari full codebase review. Kerjakan dalam urutan severity.

---

## ⚠️ CRITICAL — Webhook Integration Broken

### 1. Storage Deleted Webhook — Schema Mismatch

**File:** `src/app/api/webhook/storage-deleted/route.ts`

Worker mengirim payload:
```json
{ photoId, r2Deleted, cloudinaryDeleted, storageAccountId, fileSize }
```

Tapi Zod schema di webhook hanya menerima:
```json
{ photoId, success, error? }
```

**Dampak:** Webhook tidak pernah berhasil parsing → callback gagal → worker retry terus. `decreaseStorageUsage()` tidak pernah dipanggil.

**Fix:**
1. Update `DeletionCallbackSchema` supaya match dengan payload asli worker (`workers/deletion-worker.ts` line 441-447)
2. Tambahkan panggilan `decreaseStorageUsage(storageAccountId, fileSize)` saat deletion sukses
3. Ganti `authHeader !== \`Bearer ${expectedSecret}\`` dengan `timingSafeEqual`

---

### 2. Thumbnail Generated Webhook — Field Tidak Ada di Schema

**File:** `src/app/api/webhook/thumbnail-generated/route.ts`

Menulis ke field `mediumUrl` dan `smallUrl` di Photo, tapi **Prisma schema** (`prisma/schema.prisma`) tidak punya field `mediumUrl` dan `smallUrl` di model Photo.

**Dampak:** Prisma akan throw runtime error saat webhook dipanggil. Thumbnail yang sudah di-upload ke Cloudinary tidak ter-update di database.

**Fix (pilih salah satu):**
- **Option A:** Tambahkan `mediumUrl String?` dan `smallUrl String?` ke model Photo di `prisma/schema.prisma`, lalu `npx prisma db push`
- **Option B:** Hapus `mediumUrl` dan `smallUrl` dari webhook update, hanya update `thumbnailUrl` dan `publicId`

**Bonus:** Ganti juga secret comparison dengan `timingSafeEqual` di webhook ini.

---

## 🔴 HIGH — Deletion Pattern & Storage Usage

### 3. Single Photo Delete — DB-First Pattern (Risiko Orphan File)

**File:** `src/app/api/admin/galleries/[id]/photos/[photoId]/route.ts` (lines 111-113)

Photo dihapus dari DB **sebelum** memastikan queue berhasil. Jika queue publish gagal, file di R2/Cloudinary tetap ada tapi DB record sudah hilang → orphan file.

**Fix:** Pindahkan `prisma.photo.delete()` ke **setelah** queue result di-check success. Ikuti pattern dari `bulk-delete/route.ts`.

---

### 4. Gallery Photo Bulk Delete — DB-First + Tidak Cek Queue Result

**File:** `src/app/api/admin/galleries/[id]/photos/bulk/route.ts` (lines 121-128)

Sama seperti #3. DB delete terjadi langsung tanpa cek apakah queue berhasil. `queueStorageDeletionBulk` dipanggil tapi result-nya cuma di-log.

**Fix:** Terapkan queue-first pattern seperti di `src/app/api/admin/photos/bulk-delete/route.ts`.

---

### 5. Gallery Bulk Delete — Tidak Cek Queue Result

**File:** `src/app/api/admin/galleries/bulk/route.ts` (lines 78-82)

`queuePhotosDeletionForEntities()` dipanggil tanpa await/cek result. Gallery langsung di-delete dari DB. Bisa meninggalkan orphan file.

**Fix:** Await dan cek return value `queuePhotosDeletionForEntities()` sebelum `prisma.gallery.deleteMany()`.

---

## 🟡 MEDIUM — UI Theme & Component Issues

### 6. Dialog Component — Hardcoded Light Mode Colors

**File:** `src/components/ui/dialog.tsx`

Seluruh komponen pakai warna static (`bg-white`, `text-slate-800`, `border-slate-200`, dll) — tidak comply Aura Noir dark theme (OKLCH semantic tokens).

**Fix:** Replace dengan semantic tokens:
- `bg-white` → `bg-card`
- `text-slate-800` → `text-card-foreground`
- `text-slate-400/500` → `text-muted-foreground`
- `border-slate-200` → `border-border`
- `bg-slate-100` → `bg-muted`

---

### 7. Gallery List Page — `alert()` Dilarang

**File:** `src/app/(dashboard)/admin/galleries/page.tsx` (lines 117, 121)

Dua instance `alert()` — AGENTS.md explicit: "NEVER `alert()` — use `sonner` `toast()` only"

**Fix:** Ganti dengan `toast.error()` dari sonner.

---

### 8. Gallery Detail Page — Static Colors

**File:** `src/app/(dashboard)/admin/galleries/[id]/page.tsx`

Banyak warna static melanggar Aura Noir:
- Lines 339-340: `bg-amber-100 text-amber-800`
- Lines 354-358: `bg-red-100 text-red-700`, `bg-green-100 text-green-700`
- Lines 434: `bg-green-600/80 text-white`
- Lines 450: `bg-blue-600/80 text-white`
- Lines 461-462: `bg-red-500 text-white`

**Fix:** Replace dengan semantic tokens (`bg-primary`, `bg-destructive`, `bg-muted`, dll).

---

### 9. Admin Layout — Typo `muted0`

**File:** `src/app/(dashboard)/admin/layout.tsx` (lines 180, 187, 243)

`bg-muted0` dan `hover:bg-muted0` — typo. Harusnya `bg-muted` / `hover:bg-muted`.

---

## 🟢 LOW — Consistency

### 10. Event DELETE — Query Param Instead of Body

**File:** `src/app/api/admin/events/route.ts` (DELETE handler)

Pakai `searchParams.get('id')`, tidak konsisten dengan route lain yang pakai body atau path param.

**Fix:** Standardisasi — buat route `DELETE /api/admin/events/[id]` atau gunakan body seperti route lain.

---

## Progress Tracker

| # | Status | Deskripsi |
|---|--------|-----------|
| 1 | ⬜ | Fix storage-deleted webhook schema + timing-safe + storage usage |
| 2 | ⬜ | Fix thumbnail webhook mediumUrl/smallUrl + timing-safe |
| 3 | ⬜ | Fix single photo delete: queue-first pattern |
| 4 | ⬜ | Fix gallery photo bulk delete: queue-first pattern |
| 5 | ⬜ | Fix gallery bulk delete: check queue result |
| 6 | ⬜ | Fix dialog component: Aura Noir dark theme |
| 7 | ⬜ | Fix gallery list: alert() → toast.error() |
| 8 | ⬜ | Fix gallery detail: static colors → semantic tokens |
| 9 | ⬜ | Fix admin layout: muted0 typo |
| 10 | ⬜ | Standardize event DELETE ID passing |

---

*Generated from full codebase review — 2026-04-29*