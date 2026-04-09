# Preferensi Desain & Arsitektur (Feedback & Preferences)

## 1. Desain UI/UX (Aura Noir & Mobile-First)
- **Preferensi Utama**: Setiap kali membuat halaman baru atau komponen UI, **WAJIB** merancangnya dengan paradigma *Mobile-First / Thumb-Driven* (misalnya: menggunakan *Floating Action Bar* di area bawah layar untuk aksi penting).
- **Aturan Tema**: Gunakan tema "Aura Noir".
  - **SELALU** gunakan variabel warna semantik OKLCH (`bg-background`, `bg-card`, `text-foreground`, `bg-primary`, `text-primary-foreground`).
  - **DILARANG KERAS** menggunakan sisa kelas warna *light mode* lama (seperti `bg-white`, `text-amber-700`, `bg-green-100`, atau `text-black`).

## 2. Operasi Penghapusan File Fisik (Native Edge)
- **Preferensi Utama**: Penghapusan foto tidak boleh dilakukan secara sepihak hanya di database Postgres.
- **Aturan**: Anda **WAJIB** menyuntikkan *payload* kredensial (seperti R2 `r2Key` atau Cloudinary `thumbnailUrl`) ke dalam **Cloudflare Queues** (`queueStorageDeletionBulk` atau `queuePhotosDeletionForEntities`) **SEBELUM** mengeksekusi fungsi `delete()` di Prisma. Hal ini memastikan file fisik ikut terhapus oleh Cloudflare Worker.