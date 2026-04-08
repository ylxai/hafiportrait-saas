# Arsitektur 100% Cloudflare: PhotoStudio SaaS

## Overview

Migrasi dari VPS + BullMQ ke serverless 100% Cloudflare menggunakan:
- **Cloudflare Workers**: API + Background Processing
- **Cloudflare Queue**: Message queue (ganti BullMQ)
- **Cloudflare R2**: Object storage (sudah dipakai)
- **Cloudflare D1**: SQLite database (ganti PostgreSQL)
- **Cloudflare KV**: Session/cache storage (ganti Redis)

## Arsitektur Baru

```
┌─────────────────────────────────────────────────────────────┐
│                      CLOUDFLARE EDGE                        │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │
│  │  API Worker  │  │ Queue Worker │  │  Auth Worker │    │
│  │  (Next.js)   │  │  (Consumer)  │  │  (NextAuth)  │    │
│  └──────┬───────┘  └──────┬───────┘  └──────────────┘    │
│         │                 │                                  │
│         ▼                 ▼                                  │
│  ┌──────────────────────────────────────┐                   │
│  │      Cloudflare Queue                │                   │
│  │   • upload-processing                │                   │
│  │   • thumbnail-generation             │                   │
│  │   • storage-deletion                 │                   │
│  └──────────────────────────────────────┘                   │
│                                                              │
├─────────────────────────────────────────────────────────────┤
│                      STORAGE & DATA                           │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │  R2 Storage  │  │  D1 Database │  │  KV Storage  │       │
│  │  (Original)  │  │  (Metadata)  │  │  (Sessions)  │       │
│  └──────────────┘  └──────────────┘  └──────────────┘       │
└─────────────────────────────────────────────────────────────┘
```

## Keuntungan 100% Cloudflare

| Aspek | VPS + BullMQ | 100% Cloudflare |
|-------|--------------|-----------------|
| **Infrastructure** | 2 service (web + workers) | 1 platform unified |
| **Scaling** | Manual/PM2 | Auto (zero config) |
| **Latency** | ~50-200ms (Jakarta) | ~20-50ms (Edge) |
| **Cost** | $10-20/bulan VPS | $5-10/bulan (scale kecil) |
| **Maintenance** | Monitor 2 process | Zero (serverless) |
| **Offline Dev** | ✅ Easy | ❌ Butuh wrangler |

## File Implementasi

### 1. `wrangler.toml` - Konfigurasi Workers

```toml
name = "photostudio-api"
main = "src/index.ts"
compatibility_date = "2024-01-01"

# R2 Buckets
[[r2_buckets]]
binding = "PHOTO_BUCKET"
bucket_name = "photostudio-photos"

# D1 Database
[[d1_databases]]
binding = "DB"
database_name = "photostudio-db"
database_id = "your-db-id"

# KV Namespace untuk sessions
[[kv_namespaces]]
binding = "SESSIONS"
id = "your-kv-id"

# Queues
[[queues.producers]]
queue = "upload-jobs"
binding = "UPLOAD_QUEUE"

[[queues.producers]]
queue = "thumbnail-jobs"
binding = "THUMBNAIL_QUEUE"

[[queues.consumers]]
queue = "upload-jobs"
max_batch_size = 5
max_batch_timeout = 30

[[queues.consumers]]
queue = "thumbnail-jobs"
max_batch_size = 10
max_wait_timeout = 5
```

### 2. `src/index.ts` - API Worker

```typescript
// API endpoint untuk upload trigger
export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);
    
    // Upload endpoint
    if (url.pathname === '/api/upload' && request.method === 'POST') {
      const { filename, contentType, galleryId, r2AccountId } = await request.json();
      
      // Generate presigned URL untuk R2 (direct upload)
      const key = `uploads/${galleryId}/${Date.now()}-${filename}`;
      const presignedUrl = await env.PHOTO_BUCKET.createPresignedUrl(key, {
        method: 'PUT',
        expiresIn: 900, // 15 menit
      });
      
      const publicUrl = `https://${env.PHOTO_BUCKET.bucketName}.${env.ACCOUNT_ID}.r2.cloudflarestorage.com/${key}`;
      
      // Simpan upload session ke KV
      const uploadId = crypto.randomUUID();
      await env.SESSIONS.put(`upload:${uploadId}`, JSON.stringify({
        r2Key: key,
        publicUrl,
        galleryId,
        filename,
        storageAccountId: r2AccountId,
        status: 'pending',
      }), { expirationTtl: 3600 });
      
      return Response.json({
        presignedUrl,
        publicUrl,
        uploadId,
      });
    }
    
    // Upload complete webhook
    if (url.pathname === '/api/upload/complete' && request.method === 'POST') {
      const { uploadId, fileSize } = await request.json();
      
      // Get session from KV
      const session = await env.SESSIONS.get(`upload:${uploadId}`);
      if (!session) {
        return new Response('Upload not found', { status: 404 });
      }
      
      const data = JSON.parse(session);
      
      // Add to queue untuk generate thumbnail
      await env.THUMBNAIL_QUEUE.send({
        uploadId,
        r2Key: data.r2Key,
        galleryId: data.galleryId,
        filename: data.filename,
        fileSize,
        storageAccountId: data.storageAccountId,
      });
      
      return Response.json({
        message: 'Upload queued for processing',
        uploadId,
      });
    }
    
    return new Response('Not found', { status: 404 });
  },
};
```

### 3. `src/queue-consumer.ts` - Queue Consumer (Thumbnail Worker)

```typescript
// Consumer untuk generate thumbnail
export interface Env {
  PHOTO_BUCKET: R2Bucket;
  THUMBNAIL_QUEUE: Queue;
  DB: D1Database;
}

export default {
  // This runs when messages arrive in the queue
  async queue(batch: MessageBatch<any>, env: Env, ctx: ExecutionContext) {
    console.log(`Processing ${batch.messages.length} thumbnail jobs`);
    
    for (const message of batch.messages) {
      const { uploadId, r2Key, galleryId, filename, fileSize, storageAccountId } = message.body;
      
      try {
        // 1. Download from R2
        const object = await env.PHOTO_BUCKET.get(r2Key);
        if (!object) {
          throw new Error(`File not found in R2: ${r2Key}`);
        }
        
        const arrayBuffer = await object.arrayBuffer();
        
        // 2. Generate thumbnail using Cloudflare Images API
        // (atau pakai WASM image processing library)
        const thumbnailResult = await generateThumbnail(arrayBuffer);
        
        // 3. Upload thumbnail to R2 (thumbnail bucket atau folder)
        const thumbnailKey = `thumbnails/${galleryId}/${filename}`;
        await env.PHOTO_BUCKET.put(thumbnailKey, thumbnailResult.buffer, {
          httpMetadata: { contentType: 'image/jpeg' },
        });
        
        // 4. Save to D1 database
        await env.DB.prepare(`
          INSERT INTO photos (id, galleryId, filename, url, thumbnailUrl, fileSize, storageAccountId, createdAt)
          VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
        `).bind(
          crypto.randomUUID(),
          galleryId,
          filename,
          `https://${env.PHOTO_BUCKET.bucketName}.${env.ACCOUNT_ID}.r2.cloudflarestorage.com/${r2Key}`,
          `https://${env.PHOTO_BUCKET.bucketName}.${env.ACCOUNT_ID}.r2.cloudflarestorage.com/${thumbnailKey}`,
          fileSize,
          storageAccountId
        ).run();
        
        // 5. Acknowledge message (mark as done)
        message.ack();
        
        console.log(`✅ Thumbnail generated for ${filename}`);
        
      } catch (error) {
        console.error(`❌ Failed to process ${filename}:`, error);
        // Retry akan otomatis oleh Cloudflare Queue (max 3 retries default)
        message.retry();
      }
    }
  },
};

// Helper untuk generate thumbnail
async function generateThumbnail(buffer: ArrayBuffer): Promise<{ buffer: Uint8Array }> {
  // Opsi 1: Cloudflare Images API (recommended)
  // Opsi 2: WASM library seperti sharp-wasm atau image-js
  // Opsi 3: External service (Cloudinary via fetch)
  
  // Contoh dengan Cloudflare Images API:
  const response = await fetch('https://api.cloudflare.com/client/v4/images/v1', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${CLOUDFLARE_IMAGES_TOKEN}`,
    },
    body: new FormData(), // Upload image
  });
  
  // Simplified - return original for demo
  return { buffer: new Uint8Array(buffer) };
}
```

### 4. `schema.sql` - D1 Database Schema

```sql
-- D1 menggunakan SQLite syntax
CREATE TABLE IF NOT EXISTS galleries (
  id TEXT PRIMARY KEY,
  namaProject TEXT NOT NULL,
  clientToken TEXT UNIQUE NOT NULL,
  eventId TEXT,
  maxSelection INTEGER DEFAULT 20,
  enableDownload BOOLEAN DEFAULT 0,
  status TEXT DEFAULT 'active',
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS photos (
  id TEXT PRIMARY KEY,
  galleryId TEXT NOT NULL,
  filename TEXT NOT NULL,
  url TEXT NOT NULL,
  thumbnailUrl TEXT,
  r2Key TEXT,
  width INTEGER,
  height INTEGER,
  fileSize INTEGER,
  storageAccountId TEXT,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (galleryId) REFERENCES galleries(id)
);

CREATE INDEX IF NOT EXISTS idx_photos_gallery ON photos(galleryId);
CREATE INDEX IF NOT EXISTS idx_photos_created ON photos(createdAt);

-- Views untuk analytics (D1 support views)
CREATE VIEW IF NOT EXISTS gallery_stats AS
SELECT 
  g.id,
  g.namaProject,
  COUNT(p.id) as totalPhotos,
  SUM(p.fileSize) as totalStorage
FROM galleries g
LEFT JOIN photos p ON g.id = p.galleryId
GROUP BY g.id;
```

## Harga Estimasi (Bandingkan)

### VPS + BullMQ (Current)
```
VPS (2GB RAM):           $10-15/bulan
Redis/Valkey (Aiven):    $0 (free tier) - $10/bulan
PostgreSQL (Supabase):   $0 (free tier) - $25/bulan
Total:                   $10-50/bulan
```

### 100% Cloudflare
```
Workers (10M requests):    $5/bulan
Queues (1M ops):           $0 (included in Workers)
R2 (1TB storage):          ~$4.50/bulan + $0.36 egress/TB
D1 (5M rows):            $0-5/bulan
KV (1GB):                $0.50/bulan
Images (opsional):       $0-5/bulan
Total:                   $10-25/bulan (untuk scale medium)
```

## Pros & Cons Detail

### ✅ Keuntungan 100% Cloudflare

1. **Zero Server Management**
   - No PM2, no systemd, no server updates
   - Auto-scaling tanpa config
   - Global deployment otomatis

2. **Consistent Latency**
   - Edge computing = user selalu dekat dengan server
   - Jakarta user → Singapore edge (~20ms)
   - VS VPS Jakarta mungkin 50-200ms

3. **Cost Efficiency untuk Scale Variable**
   - Bayar per-request, bukan per-server-running
   - Kalau traffic rendah, harga rendah
   - Kalau traffic tinggi, auto-scale tanpa config

4. **Reliability**
   - No single point of failure
   - Queue ga akan hilang kalau worker crash
   - Auto-retry built-in

### ❌ Kekurangan 100% Cloudflare

1. **Vendor Lock-in**
   - D1 = SQLite (beda dari PostgreSQL/Prisma)
   - Queue API Cloudflare spesifik
   - Migration keluar sulit

2. **Development Experience**
   - Harus pakai `wrangler dev` (tambahan learning)
   - Local testing lebih kompleks
   - Hot reload lebih lambat

3. **Library Limitations**
   - Tidak semua Node.js library jalan di Workers
   - Image processing terbatas (sharp.js tidak support)
   - Harus pakai WASM atau external service

4. **Cold Start**
   - Workers punya cold start (~50-200ms)
   - Kalau traffic rendah, user rasakan delay
   - VS VPS selalu warm

## Migration Path (Kalau Mau Pindah)

### Phase 1: Prepare (1-2 minggu)
1. Export data dari PostgreSQL ke SQLite format
2. Setup D1 database dan import data
3. Setup KV untuk sessions
4. Test dengan data kecil

### Phase 2: Parallel (2-4 minggu)
1. Jalankan Cloudflare Workers bersama VPS existing
2. Route upload baru ke Workers
3. Biar existing tetap jalan di VPS
4. Monitor error rate

### Phase 3: Full Cutover (1 minggu)
1. DNS switch ke Cloudflare
2. Shutdown VPS
3. Monitor closely

## Kesimpulan

**100% Cloudflare cocok kalau:**
- ✅ Tim kecil, tidak ada DevOps dedicated
- ✅ Traffic variable (ga bisa prediksi)
- ✅ Global audience (bukan cuma Indonesia)
- ✅ Mau zero maintenance
- ✅ Budget predictable

**Tetap VPS + BullMQ kalau:**
- ✅ Sudah setup, jalan baik
- ✅ Team familiar dengan stack
- ✅ Butuh library kompleks (sharp.js, dll)
- ✅ Tidak mau vendor lock-in
- ✅ Budget VPS sudah termasuk di package lain

---

**File contoh:**
- `docs/cloudflare-example/wrangler.toml`
- `docs/cloudflare-example/api-worker.ts`
- `docs/cloudflare-example/queue-consumer.ts`
- `docs/cloudflare-example/schema.sql`

Mau saya buatkan proof-of-concept migration plan?
