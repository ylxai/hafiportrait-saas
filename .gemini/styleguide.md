# PhotoStudio SaaS - Code Review Style Guide

## Pendahuluan
Dokumen ini menguraikan pedoman kode (*coding conventions*), arsitektur, dan prinsip UI/UX untuk aplikasi **PhotoStudio SaaS**. Gemini Code Assist *wajib* mematuhi dan menegakkan panduan ini saat melakukan peninjauan kode (*Code Review*) pada *Pull Request*.

## 1. Prinsip Utama (Key Principles)
*   **Keamanan & Ketahanan Tipe (Type Safety):** Gunakan TypeScript yang ketat. Larangan absolut pada penggunaan tipe `any`.
*   **Performa & Modernisasi:** Gunakan standar Next.js App Router (React 19) terbaru dan optimasi pemisahan *Server Components* dengan *Client Components*.
*   **UX/UI Hibrida (Mobile-First):** Utamakan antarmuka yang ramah sentuhan, dapat dikontrol jempol (*thumb-driven navigation*), dan selaras dengan tema gelap.
*   **Arsitektur Serverless Mutakhir:** Fokus pada latensi nol (*Zero Latency*) dan penghapusan bot leher botol (*bottlenecks*) konvensional dengan *Edge computing*.

## 2. Pedoman UI/UX (Aura Noir - The OLED Luxury)
Aplikasi ini menggunakan tema desain **Aura Noir (The OLED Luxury)** sebagai antarmuka *default* untuk seluruh pengguna, khususnya di dasbor Admin dan Galeri Klien.

### Tailwind CSS v4 & Sistem Warna
*   **DILARANG KERAS** menggunakan kode warna statis warisan (seperti `bg-white`, `text-slate-800`, `bg-gray-100`).
*   Gunakan secara eksklusif variabel CSS berbasis **OKLCH** dari `@theme` bawaan Tailwind v4:
    *   Latar Utama: `bg-background` (OLED Black, hemat daya).
    *   Latar Kartu/Elemen: `bg-card` (Charcoal dengan transparansi).
    *   Teks Umum: `text-foreground` (Putih terang).
    *   Teks Redup: `text-muted-foreground`.
    *   Aksen Utama: `bg-primary`, `text-primary-foreground` (Emas/Gold premium).
*   Hindari penggunaan fungsi usang `rgba()` di dalam CSS property bawaan seperti `shadow`. Gunakan format rgb, misal: `shadow-[0_0_10px_rgb(224,155,61)]`.

### Navigasi Berbasis Jempol (Thumb-Driven UX)
*   Di perangkat seluler, gunakan *Floating Action Bar (FAB)* di bagian bawah layar atau *Bottom Navigation Bar* sebagai navigasi utama.
*   Hindari peletakan tombol krusial (seperti "Kirim" atau "Simpan") di bagian atas layar (*header*) yang sulit dijangkau jari pengguna.

### Komponen React (shadcn/ui & base-ui)
*   Gunakan komponen standar shadcn/ui (berbasis `@base-ui/react`) yang tersedia di `src/components/ui/`.

## 3. Pedoman TypeScript & Linting
### ESLint Strict `no-any`
*   Tipe data `any` **SANGAT DILARANG**.
*   Gunakan `unknown` dan validasikan datanya (misal via *Zod*), atau gunakan *Generic Types* (`<T>`).

### Penanganan `BigInt` pada Prisma
*   Prisma mengembalikan `BigInt` pada kolom penyimpanan ukuran besar. JSON bawaan Next.js tidak bisa melakukan serialisasi `BigInt`.
*   *WAJIB* dikonversi menjadi *String*: `fileSize: photo.fileSize?.toString()`.

## 4. Arsitektur Latar Belakang (Background Jobs & Edge)
**Konteks Penting:** Proyek ini membuang Node.js konvensional/BullMQ dan **mengadopsi Cloudflare Queues + Cloudflare Workers (Native Edge)**.
*   Next.js bertindak sebagai *Publisher*: Mengirimkan pesan melalui HTTP POST API REST langsung ke Cloudflare Queues.
*   Tugas penghapusan (*storage cleanup*) dieksekusi secara asinkron oleh Worker di jaringan *Edge*.
*   *WAJIB* menjaga kode fungsi penghapusan file API (R2 & Cloudinary) bersifat **idempoten**.

## 5. Arsitektur Penyimpanan Ganda (Dual Storage)
Penyimpanan R2 dan Cloudinary ditangani secara spesifik:
*   **Original Files:** Disimpan di **Cloudflare R2**. Unggahan foto difasilitasi *langsung* (Direct Upload) oleh browser klien (*bypass server*) menggunakan mekanisme **Presigned URL**.
*   **Thumbnails:** Disimpan dan dirender secara responsif di **Cloudinary**.
*   **Kredensial Dinamis:** Kredensial tidak ditarik kaku dari `.env`. *Semua kunci akses* Cloudinary dan akun S3 R2 diambil dari *Database* (Tabel `StorageAccount`), mendukung multi-akun oleh Admin.

## 6. Payment System & Status Enum
Sistem pembayaran menggunakan status enum yang **TERBATAS** dan **KONSISTEN** di seluruh codebase:

### Payment Status Enum (FINAL)
Status pembayaran yang **DIIZINKAN** dalam sistem:
*   `unpaid` - Belum dibayar (status awal booking)
*   `partial` - Sebagian dibayar (DP)
*   `paid` - Lunas (pembayaran selesai)
*   `awaiting_confirmation` - Menunggu konfirmasi admin (setelah upload bukti)

### Status yang TIDAK DIGUNAKAN
Status berikut **TIDAK BOLEH** digunakan karena tidak didukung di finance dashboard dan reporting:
*   ❌ `fully_paid` - Gunakan `paid` sebagai gantinya
*   ❌ `dp_paid` - Gunakan `partial` sebagai gantinya

### Payment Flow
1. **Booking Created** → `paymentStatus: 'unpaid'`
2. **User Upload Proof** → `paymentStatus: 'awaiting_confirmation'`
3. **Admin Approve** → `paymentStatus: 'paid'` atau `'partial'`

### Validasi
*   Zod schema di `src/lib/api/validation.ts` HARUS match dengan enum di atas
*   Finance dashboard di `src/app/(dashboard)/admin/finance/` hanya handle 4 status tersebut
*   Public invoice page di `src/app/booking/invoice/` hanya render 4 status tersebut
