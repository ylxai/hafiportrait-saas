# Cloudflare Integration Examples for PhotoStudio

Dokumentasi dan contoh implementasi untuk mengintegrasikan Cloudflare dengan PhotoStudio SaaS.

## 🎯 2 Pilihan Arsitektur

### 1️⃣ Hybrid Architecture (Recommended)
**Next.js VPS + Cloudflare Workers**

- ✅ **Next.js** tetap di VPS dengan PostgreSQL + Prisma
- ✅ **Workers** (background processing) di Cloudflare Workers
- ✅ Database tetap PostgreSQL (tidak perlu migrate ke D1)
- ✅ Best of both worlds

**File:**
- `HYBRID_ARCHITECTURE.md` - Penjelasan konsep
- `HYBRID_SETUP.md` - Step-by-step setup guide
- `wrangler-hybrid.toml` - Config untuk workers
- `src/publisher.ts` - Publisher ke Cloudflare Queue (di VPS)
- `src/worker-hybrid.ts` - Worker consumer (Cloudflare)
- `src/webhook-handler.ts` - Webhook handler (di VPS)
- `src/upload-complete-hybrid.ts` - Contoh integrasi

**Use case:**
- Sudah ada VPS yang berjalan baik
- Mau auto-scaling untuk workers saja
- Tidak mau migrate database
- Tim familiar dengan PostgreSQL + Prisma

### 2️⃣ Full Cloudflare Architecture
**100% Serverless (Workers + D1 + R2)**

- ✅ **Semuanya** di Cloudflare (Workers, Queue, D1, R2)
- ✅ Tidak ada VPS yang perlu di-manage
- ✅ Auto-scaling end-to-end
- ⚠️ Database jadi SQLite (D1), tidak bisa pakai Prisma

**File:**
- `ARCHITECTURE.md` - Penjelasan full arsitektur
- `wrangler.toml` - Config lengkap
- `schema.sql` - Database schema untuk D1
- `src/index.ts` - Main API Worker
- `src/router.ts` - Simple router
- `src/queue-consumers.ts` - Queue consumers

**Use case:**
- Greenfield project (dari awal)
- Tidak ada DevOps resource
- Mau zero maintenance
- Budget predictable lebih penting

## 📁 File Structure

```
docs/cloudflare-example/
├── README.md                          # Dokumen ini
│
├── HYBRID_ARCHITECTURE.md            # ⭐ Hybrid: Konsep & alur
├── HYBRID_SETUP.md                  # ⭐ Hybrid: Setup guide
├── wrangler-hybrid.toml             # ⭐ Hybrid: Worker config
│
├── ARCHITECTURE.md                   # Full Cloudflare: Arsitektur
├── README-CLOUDFLARE.md              # Full Cloudflare: Setup
├── wrangler.toml                     # Full Cloudflare: Config
├── schema.sql                        # Full Cloudflare: D1 schema
│
└── src/
    ├── publisher.ts                  # ⭐ Hybrid: Queue publisher
    ├── worker-hybrid.ts              # ⭐ Hybrid: Worker consumer
    ├── webhook-handler.ts            # ⭐ Hybrid: VPS webhook
    ├── upload-complete-hybrid.ts     # ⭐ Hybrid: API integration
    │
    ├── index.ts                      # Full: API Worker
    ├── router.ts                     # Full: Router
    └── queue-consumers.ts            # Full: Queue consumers
```

## 🚀 Quick Decision Guide

| Pertanyaan | Hybrid | Full Cloudflare |
|------------|--------|-----------------|
| Sudah ada VPS? | ✅ Yes | ❌ No (shutdown) |
| Mau keep PostgreSQL? | ✅ Yes | ❌ Migrate ke D1 |
| Mau keep Prisma ORM? | ✅ Yes | ❌ Raw SQL/D1 |
| Mau auto-scaling workers? | ✅ Yes | ✅ Yes |
| Mau zero server management? | ❌ VPS tetap ada | ✅ Yes |
| Budget minim? | ❌ Dual cost | ✅ Single platform |

**Recommendation:**
- 🎯 **Hybrid** untuk existing project yang sudah jalan
- 🌟 **Full Cloudflare** untuk project baru atau major rewrite

## 🆚 Perbandingan Detail

| Aspek | Hybrid | Full Cloudflare |
|-------|--------|-----------------|
| **Web App** | Next.js (VPS) | Cloudflare Workers |
| **Database** | PostgreSQL (Supabase/dll) | D1 (SQLite) |
| **Workers** | Cloudflare Workers | Cloudflare Workers |
| **Queue** | Cloudflare Queue | Cloudflare Queue |
| **Storage** | R2 | R2 |
| **ORM** | Prisma | Raw SQL / Kysely |
| **Image Processing** | Cloudinary API | Cloudinary API |
| **Monitoring** | PM2 + Wrangler | Wrangler Dashboard |
| **Complexity** | Medium | High (rewrite) |

## ⚡ Setup

### Hybrid (Next.js VPS + Cloudflare Workers)

```bash
# 1. Setup Cloudflare resources
cd docs/cloudflare-example
source ~/venv/bin/activate
npx wrangler queue create thumbnail-generation
npx wrangler queue create storage-deletion

# 2. Copy publisher ke VPS codebase
cp src/publisher.ts ../../src/lib/cloudflare/queue.ts

# 3. Deploy workers
npx wrangler deploy --config wrangler-hybrid.toml

# 4. Update VPS env dan code (lihat HYBRID_SETUP.md)
```

### Full Cloudflare

```bash
# Lihat README-CLOUDFLARE.md untuk detail lengkap
cd docs/cloudflare-example
cat README-CLOUDFLARE.md
```

## 📝 Environment Variables

### Hybrid (VPS)

```env
# Database (tetap sama)
DATABASE_URL=postgresql://...
REDIS_URL=redis://...

# Cloudflare Queue
CLOUDFLARE_ACCOUNT_ID=xxx
CLOUDFLARE_API_TOKEN=yyy

# Webhook (untuk callback dari workers)
WEBHOOK_SECRET=your-secret-key
```

### Full Cloudflare

```env
# Wrangler secrets (gunakan `wrangler secret put`)
# - DATABASE_URL (jika tetap pakai PostgreSQL eksternal)
# - CLOUDINARY_API_KEY
# - CLOUDINARY_API_SECRET
# - JWT_SECRET
```

## 💡 Best Practices

### Hybrid
1. Selalu aktifkan Python venv sebelum wrangler: `source ~/venv/bin/activate`
2. Gunakan queue fallback ke BullMQ untuk reliability
3. Monitor webhook response time (bisa jadi bottleneck)
4. Log semua queue operations untuk debugging

### Full Cloudflare
1. Test dengan `wrangler dev` sebelum deploy
2. Gunakan D1 untuk metadata, R2 untuk files
3. Implement proper error handling dengan retries
4. Monitor cold start dengan warmup requests

## 🔗 Referensi

- [Cloudflare Workers Docs](https://developers.cloudflare.com/workers/)
- [Cloudflare Queue Docs](https://developers.cloudflare.com/queues/)
- [Cloudflare D1 Docs](https://developers.cloudflare.com/d1/)
- [Cloudflare R2 Docs](https://developers.cloudflare.com/r2/)

## ❓ FAQ

**Q: Bisakah pakai kedua arsitektur secara bersamaan?**
A: Tidak direkomendasikan. Pilih satu untuk consistency.

**Q: Bagaimana migrasi dari Hybrid ke Full?**
A: Butuh rewrite database layer (Prisma → D1/Kysely). Plan untuk downtime.

**Q: Apakah bisa fallback jika Cloudflare down?**
A: Hybrid: Yes (fallback ke BullMQ). Full: Limited (D1 juga di Cloudflare).

**Q: Development experience mana yang lebih baik?**
A: Hybrid lebih familiar (Next.js + Prisma tetap sama). Full perlu adaptasi.

---

**Pilihan arsitektur adalah trade-off. Hybrid memberikan balance terbaik untuk existing project!**
