# Arsitektur Hybrid: Next.js VPS + Cloudflare Workers

Dokumen ini menjelaskan setup hybrid dimana:
- **Next.js** tetap berjalan di VPS dengan PostgreSQL + Prisma
- **Workers** (background processing) dijalankan di Cloudflare Workers

## 🎯 Tujuan

Menggunakan Cloudflare Workers untuk:
1. ✅ **Thumbnail generation** (download dari R2 → upload ke Cloudinary)
2. ✅ **Storage cleanup** (delete dari R2 + Cloudinary saat foto dihapus)
3. ✅ **Auto-scaling** tanpa manage server
4. ✅ **Edge processing** (lebih dekat ke R2/Cloudinary)

Tetap di VPS:
1. ✅ **Next.js web app** (API + Admin UI)
2. ✅ **PostgreSQL database** (metadata foto, user, gallery)
3. ✅ **Prisma ORM** (tidak perlu ganti ke D1)
4. ✅ **Redis/BullMQ** (bisa tetap pakai untuk fallback)

## 🏗️ Arsitektur

```
┌─────────────────────────────────────────────────────────────┐
│                     VPS (Next.js)                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │
│  │  API Routes   │  │  Queue Mgmt  │  │  Admin UI    │    │
│  │  (Presigned)  │  │  (Publisher) │  │  (Dashboard) │    │
│  └──────┬────────┘  └──────┬───────┘  └───────────────┘    │
│         │                  │                                │
│         │                  ▼                                │
│  ┌──────▼────────────────────────────────────────┐         │
│  │  PostgreSQL + Redis                          │         │
│  │  • Photo metadata                            │         │
│  │  • Queue fallback                            │         │
│  └──────────────────────────────────────────────┘         │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ HTTP / Queue Message
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              CLOUDFLARE WORKERS                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │  Thumbnail   │  │  Cloudinary  │  │  Webhook     │      │
│  │  Generator   │  │  Upload      │  │  Callback    │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│                                                              │
│  • Download dari R2                                          │
│  • Generate thumbnail via Cloudinary API                   │
│  • Callback ke VPS untuk save ke PostgreSQL                │
└─────────────────────────────────────────────────────────────┘
```

## 🔄 Alur Upload

```
1. Client → VPS (/api/upload/presigned)
   ↓
2. VPS → Generate presigned URL untuk R2
   ↓
3. Client → Upload langsung ke R2 (direct)
   ↓
4. Client → VPS (/api/upload/complete)
   ↓
5. VPS → Publish ke Cloudflare Queue
   ↓
6. Cloudflare Worker → Process:
   • Download dari R2
   • Upload ke Cloudinary (thumbnail)
   ↓
7. Worker → Webhook ke VPS (/api/webhook/photo-created)
   ↓
8. VPS → Save ke PostgreSQL via Prisma
   ↓
9. VPS → Notify client via Ably
```

## 📦 File yang Sudah Dibuat

```
docs/cloudflare-example/
├── HYBRID_ARCHITECTURE.md          # Dokumen ini
├── src/
│   ├── publisher.ts                 # Publisher ke Cloudflare Queue (VPS)
│   ├── worker-hybrid.ts             # Worker consumer (Cloudflare)
│   ├── webhook-handler.ts           # Webhook handler (VPS)
│   └── upload-complete-hybrid.ts    # Contoh integrasi ke API route
└── wrangler-hybrid.toml             # Config untuk deploy workers
```

## 🚀 Setup Step-by-Step

### 1. Setup Cloudflare Resources

```bash
# Aktifkan venv jika perlu
source ~/venv/bin/activate

# Buat Queue
npx wrangler queue create thumbnail-generation
npx wrangler queue create storage-deletion

# Buat R2 bucket (jika belum ada)
npx wrangler r2 bucket create photostudio-photos

# Note: Tidak perlu D1 untuk hybrid setup!
```

### 2. Copy Publisher ke VPS Codebase

```bash
# Copy file publisher ke lib
mkdir -p src/lib/cloudflare
cp docs/cloudflare-example/src/publisher.ts src/lib/cloudflare/queue.ts
```

### 3. Update Environment Variables

Tambah ke `.env`:

```env
# Cloudflare Account
CLOUDFLARE_ACCOUNT_ID=your-account-id
CLOUDFLARE_API_TOKEN=your-api-token-with-queue-write-permission

# Webhook Secret (untuk verify callback dari workers)
WEBHOOK_SECRET=your-random-secret-key
```

### 4. Deploy Cloudflare Workers

```bash
cd docs/cloudflare-example
source ~/venv/bin/activate

# Setup secrets
npx wrangler secret put VPS_WEBHOOK_SECRET --config wrangler-hybrid.toml
npx wrangler secret put CLOUDINARY_API_KEY --config wrangler-hybrid.toml
npx wrangler secret put CLOUDINARY_API_SECRET --config wrangler-hybrid.toml

# Deploy workers
npx wrangler deploy --config wrangler-hybrid.toml
```

### 5. Update API Route di VPS

Di `/src/app/api/admin/upload/complete/route.ts`:

```typescript
import { queueThumbnailGeneration } from '@/lib/cloudflare/queue';

// Dalam POST handler:
const result = await queueThumbnailGeneration({
  uploadId,
  r2Key,
  publicUrl,
  galleryId,
  filename,
  fileSize,
  width,
  height,
  storageAccountId,
});

if (result.success) {
  return successResponse({
    message: 'Upload queued for processing',
    uploadId,
    status: 'queued',
  });
}
```

### 6. Tambah Webhook Handler

Copy `webhook-handler.ts` ke API route:

```bash
mkdir -p src/app/api/webhook
cp docs/cloudflare-example/src/webhook-handler.ts src/app/api/webhook/route.ts
```

### 7. Update Delete Route

Di `/src/app/api/admin/galleries/[id]/photos/[photoId]/route.ts`:

```typescript
import { queueStorageDeletion } from '@/lib/cloudflare/queue';

// Dalam DELETE handler:
await queueStorageDeletion({
  photoId,
  r2Key: photo.r2Key,
  thumbnailUrl: photo.thumbnailUrl,
  storageAccountId: photo.storageAccountId,
  fileSize: photo.fileSize,
});
```

## ⚙️ Konfigurasi

### wrangler-hybrid.toml

```toml
name = "photostudio-workers"
main = "src/worker-hybrid.ts"
compatibility_date = "2024-01-01"

[vars]
VPS_WEBHOOK_URL = "https://your-vps.com/api/webhook"
CLOUDINARY_CLOUD_NAME = "your-cloud-name"

[[r2_buckets]]
binding = "PHOTO_BUCKET"
bucket_name = "photostudio-photos"

[[queues.consumers]]
queue = "thumbnail-generation"
max_batch_size = 10
max_wait_timeout = 5
```

## 💰 Cost Comparison

| Komponen | Full VPS | Hybrid (Ini) | Full Cloudflare |
|----------|----------|--------------|-----------------|
| VPS | $10-20/bulan | $5-10/bulan (smaller) | $0 |
| Workers | $0 | $5/bulan | $5/bulan |
| Database | PostgreSQL $0-25 | PostgreSQL $0-25 | D1 $5 |
| Queue | Redis $0-10 | Cloudflare Queue included | included |
| **Total** | $10-55 | $15-35 | $10-15 |

## ⚠️ Trade-offs

### ✅ Keuntungan
- Next.js tetap familiar (tidak perlu rewrite)
- PostgreSQL + Prisma tetap bisa dipakai
- Auto-scaling workers tanpa PM2
- Workers di edge (lebih cepat akses R2)
- Fallback ke BullMQ jika Cloudflare down

### ⚠️ Kekurangan
- Dual system (VPS + Cloudflare) = lebih kompleks
- Network hop tambahan (Worker → VPS callback)
- Debug lebih sulit (split logs)
- Need manage 2 environments

## 🔍 Monitoring

### Di VPS (PM2)
```bash
pm2 logs
pm2 monit
```

### Di Cloudflare
```bash
# View logs
npx wrangler tail --config wrangler-hybrid.toml

# View queue stats
npx wrangler queue info thumbnail-generation
```

## 🆘 Troubleshooting

### Queue message tidak diproses
1. Check Cloudflare Worker logs: `wrangler tail`
2. Verify webhook URL bisa diakses dari internet
3. Check webhook secret match

### Worker error
1. Check R2 bucket permission
2. Verify Cloudinary credentials
3. Check VPS webhook endpoint return 200

### Fallback ke BullMQ
Jika Cloudflare Queue down, otomatis fallback ke BullMQ:
```typescript
const result = await queueWithFallback(
  'thumbnail-generation',
  data,
  uploadQueue // BullMQ fallback
);
```

## 📝 Todo untuk Implementasi

- [ ] Copy `publisher.ts` ke `src/lib/cloudflare/queue.ts`
- [ ] Tambah environment variables
- [ ] Update `upload/complete` route
- [ ] Update `delete photo` route
- [ ] Deploy workers dengan wrangler
- [ ] Test end-to-end upload
- [ ] Setup monitoring & alerts
- [ ] Dokumentasikan fallback procedure

---

**Status:** Dokumentasi dan contoh kode siap. Tinggal copy-paste dan deploy!
