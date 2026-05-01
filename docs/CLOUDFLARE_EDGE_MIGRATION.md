# Rancangan Migrasi Cloudflare Native Edge

## 1. Arsitektur Baru
- **Publisher (Next.js):** Aplikasi utama (berjalan di VPS) tidak lagi mengirim tugas ke Redis/BullMQ. Sebagai gantinya, ia akan mengirim pesan ke **Cloudflare Queues** menggunakan REST API Cloudflare.
- **Broker (Cloudflare Queues):** Antrean pesan akan ditampung sepenuhnya di infrastruktur Cloudflare (tanpa membebani RAM/Storage VPS).
- **Consumer (Cloudflare Workers):** Sebuah *worker* (berada di direktori `workers/`) akan di-deploy ke Cloudflare Edge. Worker ini akan mengonsumsi pesan dari antrean dan melakukan operasi penghapusan foto secara instan ke R2 dan Cloudinary.
- **Webhook Feedback:** Setelah Worker selesai memproses *batch* penghapusan, ia akan mengirimkan *HTTP POST request* (Webhook) kembali ke aplikasi Next.js di VPS untuk memberikan status *realtime* (via Ably) ke dasbor Admin.

## 2. Langkah-langkah Migrasi
1. **Persiapan Infrastruktur Cloudflare:**
   - Membuat antrean (Queue) baru di Cloudflare (misal: `photo-deletion-queue`).
   - Menyesuaikan konfigurasi `wrangler.toml` di direktori `workers/` untuk mengaitkan antrean tersebut dengan Worker.
2. **Penyesuaian Next.js (Publisher):**
   - Menghapus pemanggilan `deletionQueue.add()` dari modul antrean lokal.
   - Membuat *helper* baru untuk mengirim pesan ke Cloudflare Queues via REST API menggunakan `CLOUDFLARE_API_TOKEN`.
3. **Pengembangan Cloudflare Worker (Consumer):**
   - Menyempurnakan kode dari `workers/deletion-worker.ts` yang sudah ada.
   - Menambahkan logika pemanggilan API Cloudinary (untuk menghapus *thumbnail*).
   - Menambahkan logika pemanggilan Webhook ke server VPS beserta `WEBHOOK_SECRET` untuk validasi keamanan.
4. **Penyiapan Webhook di Next.js:**
   - Membuat API Route baru `POST /api/webhook/cloudflare` untuk menerima laporan progres dari Worker.
   - Endpoint ini akan memvalidasi *secret key* dan memancarkan *event* ke Ably untuk *update realtime*.
5. **Pembersihan (Cleanup) BullMQ:**
   - Menghapus paket `bullmq` dan `ioredis`.
   - Menghapus konfigurasi terkait *local workers* seperti `src/lib/workers.ts`, `src/lib/queue.ts`, dan pengaturan PM2 (`ecosystem.config.js`).

## 3. Solusi Konflik `CLOUDFLARE_API_TOKEN` & Wrangler

Konflik yang Anda temukan saat menggunakan perintah `npx wrangler` disebabkan oleh Wrangler yang membaca variabel `CLOUDFLARE_API_TOKEN` dari file `.env` di root proyek. Jika token tersebut dibuat dengan *permissions* yang sangat terbatas (misal hanya untuk Queue) atau formatnya berbenturan dengan mekanisme otentikasi global Wrangler, perintah *deploy* akan gagal.

**Solusi yang akan diterapkan:**

1. **Mengamankan Token untuk Next.js:**
   - File `.env` di *root* proyek akan tetap menyimpan Token API, namun kita akan mengganti namanya menjadi sesuatu yang spesifik, misalnya `NEXT_SERVER_CF_QUEUE_TOKEN` atau mengabaikan eksistensi variabel tersebut pada CLI Wrangler agar tidak terdeteksi secara otomatis (dan tidak menyebabkan *error* bentrok) oleh alat baris perintah Wrangler. Aplikasi Next.js akan dimodifikasi untuk membaca nama variabel ini saat melakukan panggilan REST API ke Cloudflare Queues.
2. **Pisahkan Lingkungan Eksekusi (Isolasi Wrangler):**
   - Semua operasi *deploy* Wrangler akan difokuskan secara ketat di dalam sub-direktori `workers/`.
   - Di dalam folder `workers/`, kita akan membuat file konfigurasi mandiri bernama `.dev.vars` (ini adalah standar bawaan Cloudflare Workers untuk menyimpan rahasia saat *testing* lokal).
3. **Manajemen Secrets di Production:**
   - Variabel rahasia yang dibutuhkan oleh Worker (seperti kredensial Cloudinary dan rahasia Webhook) tidak akan disimpan dalam *plaintext* di `.env` yang dibaca Wrangler. Rahasia ini akan disuntikkan secara aman secara langsung ke platform Cloudflare menggunakan perintah CLI Wrangler:
     ```bash
     cd workers/
     npx wrangler secret put CLOUDINARY_URL
     npx wrangler secret put WEBHOOK_SECRET
     ```
