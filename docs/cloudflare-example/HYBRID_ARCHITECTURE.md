# Arsitektur Hybrid: Next.js VPS + Cloudflare Workers

## Konsep

Pisahkan **Web App** (Next.js) dan **Workers** (Cloudflare Workers):

```
┌─────────────────────────────────────────────────────────────┐
│                     VPS (Next.js)                           │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │  Next.js API │  │  Queue Mgmt  │  │  Admin UI    │      │
│  │  (Presigned) │  │  (BullMQ)    │  │  (Dashboard) │      │
│  └──────┬───────┘  └──────┬───────┘  └──────────────┘      │
│         │                 │                                  │
│         │                 ▼                                  │
│  ┌──────▼──────────────────────────────────────┐            │
│  │  PostgreSQL + Redis (Aiven)                   │            │
│  │  • Photo metadata                           │            │
│  │  • Queue jobs                               │            │
│  └─────────────────────────────────────────────┘            │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ Webhook / Queue
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              CLOUDFLARE WORKERS                             │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │  Thumbnail   │  │  Cloudinary  │  │  Storage     │      │
│  │  Generator   │  │  Upload      │  │  Cleanup     │      │
│  │  Worker      │  │  Worker      │  │  Worker      │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│                                                              │
│  • Download dari R2                                          │
│  • Generate thumbnail via Cloudinary                         │
│  • Update database via API call ke VPS                       │
│  • Tidak perlu akses langsung ke PostgreSQL                  │
└─────────────────────────────────────────────────────────────┘
```

## Alur Kerja

### Upload Flow:

1. **Client** → **Next.js API** (`/api/upload/presigned`)
   - Generate presigned URL untuk R2
   - Simpan upload session ke Redis
   - Return presigned URL ke client

2. **Client** → **R2** (Direct upload)
   - Upload file langsung ke R2
   - Tanpa melalui server

3. **Client** → **Next.js API** (`/api/upload/complete`)
   - Notify upload selesai
   - **Queue job ke Cloudflare Worker** via:
     - **Opsi A**: Cloudflare Queue (push message)
     - **Opsi B**: Webhook langsung ke Worker URL

4. **Cloudflare Worker**:
   - Download file dari R2
   - Upload ke Cloudinary untuk thumbnail
   - **Call back ke Next.js API** untuk save ke database
   - Atau: Simpan ke D1 (SQLite) kemudian sinkronisasi

### Keuntungan Arsitektur Ini:

| Aspek | Full VPS | Hybrid (Ini) | Full Cloudflare |
|-------|----------|--------------|-----------------|
| **Web App** | VPS | VPS | Workers |
| **Workers** | VPS (BullMQ) | **Workers (Edge)** | Workers |
| **Database** | PostgreSQL | PostgreSQL | D1 (SQLite) |
| **Image Processing** | sharp.js | **Cloudinary API** | Cloudinary API |
| **Scaling Workers** | Manual PM2 | **Auto (Edge)** | Auto |
| **Complexity** | Low | Medium | High |

## Opsi Implementasi

### Opsi A: Webhook ke Cloudflare Worker

Next.js VPS memanggil Cloudflare Worker URL langsung:

```typescript
// /api/admin/upload/complete/route.ts
export async function POST(request: Request) {
  const { uploadId, fileSize } = await request.json();
  
  // Trigger Cloudflare Worker via HTTP
  await fetch('https://photostudio-workers.your-account.workers.dev/process', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${WORKER_SECRET}` },
    body: JSON.stringify({ uploadId, fileSize, galleryId }),
  });
  
  return Response.json({ status: 'processing' });
}
```

**Cloudflare Worker:**
```typescript
export default {
  async fetch(request: Request, env: Env) {
    const { uploadId, fileSize, galleryId } = await request.json();
    
    // Process: download dari R2, upload ke Cloudinary
    const result = await processThumbnail(uploadId, fileSize, galleryId);
    
    // Callback ke Next.js API untuk save ke database
    await fetch('https://your-vps.com/api/webhook/photo-created', {
      method: 'POST',
      body: JSON.stringify(result),
    });
    
    return Response.json({ success: true });
  }
};
```

### Opsi B: Cloudflare Queue (Recommended)

Next.js push message ke Cloudflare Queue:

```typescript
// Publisher di Next.js VPS
import { Queue } from '@cloudflare/queues';

const queue = new Queue({
  accountId: process.env.CLOUDFLARE_ACCOUNT_ID!,
  token: process.env.CLOUDFLARE_API_TOKEN!,
});

// Push job
await queue.send('thumbnail-generation', {
  uploadId,
  r2Key,
  galleryId,
  fileSize,
});
```

**Cloudflare Worker (Consumer):**
```typescript
export default {
  async queue(batch: MessageBatch, env: Env) {
    for (const message of batch.messages) {
      const { uploadId, r2Key, galleryId, fileSize } = message.body;
      
      // Process
      const result = await processThumbnail(r2Key, galleryId);
      
      // Callback ke VPS untuk save ke database
      await notifyVps('photo-created', result);
      
      message.ack();
    }
  }
};
```

### Opsi C: BullMQ + Cloudflare (Hybrid Queue)

Gunakan BullMQ di VPS, tapi workers di Cloudflare via HTTP trigger:

```typescript
// /src/lib/queue.ts (VPS)
import { Queue } from 'bullmq';

const thumbnailQueue = new Queue('thumbnail-generation');

// Worker job calls Cloudflare
thumbnailQueue.add('process', data, {
  opts: {
    // Custom worker yang call Cloudflare
    attempts: 3,
  }
});

// Custom worker di VPS yang forward ke Cloudflare
queueWorker.process(async (job) => {
  await fetch('https://photostudio-workers.workers.dev/process', {
    method: 'POST',
    body: JSON.stringify(job.data),
  });
});
```

## Perbandingan Opsi

| Opsi | Keuntungan | Kekurangan |
|------|------------|------------|
| **A: Webhook** | Simple, no queue system | No retry mechanism, blocking |
| **B: Cloudflare Queue** | Auto-retry, reliable | Need Cloudflare Queue setup |
| **C: BullMQ Bridge** | Familiar BullMQ API | Complex, double network hop |

## Rekomendasi: Opsi B (Cloudflare Queue)

**Kenapa?**
1. ✅ Retry otomatis jika worker gagal
2. ✅ Batching support (process multiple jobs)
3. ✅ Dead letter queue untuk failed jobs
4. ✅ Decoupled: VPS tidak perlu tau workers sedang busy atau tidak

## Setup untuk Opsi B

### 1. Setup Cloudflare Resources

```bash
# Aktifkan venv
source ~/venv/bin/activate

# Buat Queue
npx wrangler queue create thumbnail-generation
npx wrangler queue create storage-deletion

# Buat Worker (sudah ada contoh di docs/cloudflare-example/)
```

### 2. wrangler.toml untuk Workers Only

```toml
name = "photostudio-workers"
main = "src/workers.ts"
compatibility_date = "2024-01-01"

# Tidak perlu D1 - kita pakai PostgreSQL di VPS via HTTP callback
# Tidak perlu KV - untuk session/cache saja jika perlu

[[queues.consumers]]
queue = "thumbnail-generation"
max_batch_size = 10
max_wait_timeout = 5

[[queues.consumers]]
queue = "storage-deletion"
max_batch_size = 20

[vars]
# URL ke VPS untuk callback
VPS_WEBHOOK_URL = "https://your-vps.com/api/webhook"
```

### 3. Publisher di Next.js (VPS)

Tambah library `@cloudflare/queues` atau pakai REST API:

```typescript
// /src/lib/cloudflare-queue.ts
export async function publishToQueue(
  queueName: string,
  message: any
) {
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/queues/${QUEUE_ID}/messages`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ messages: [{ body: message }] }),
    }
  );
  
  return response.json();
}
```

### 4. Consumer di Cloudflare Workers

```typescript
// docs/cloudflare-example/src/workers-hybrid.ts
export interface Env {
  PHOTO_BUCKET: R2Bucket;
  VPS_WEBHOOK_URL: string;
  VPS_WEBHOOK_SECRET: string;
}

export default {
  async queue(batch: MessageBatch, env: Env) {
    for (const message of batch.messages) {
      try {
        const result = await processJob(message.body, env);
        
        // Callback ke VPS untuk save ke database
        await fetch(`${env.VPS_WEBHOOK_URL}/photo-created`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${env.VPS_WEBHOOK_SECRET}`,
          },
          body: JSON.stringify(result),
        });
        
        message.ack();
      } catch (error) {
        console.error('Job failed:', error);
        message.retry();
      }
    }
  }
};
```

### 5. Webhook Handler di Next.js

```typescript
// /app/api/webhook/photo-created/route.ts
export async function POST(request: Request) {
  const auth = request.headers.get('Authorization');
  if (auth !== `Bearer ${process.env.WEBHOOK_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }
  
  const { photoId, galleryId, thumbnailUrl, filename, fileSize } = await request.json();
  
  // Save ke PostgreSQL via Prisma
  const photo = await prisma.photo.create({
    data: {
      id: photoId,
      galleryId,
      filename,
      thumbnailUrl,
      fileSize: BigInt(fileSize),
      // ...
    },
  });
  
  // Notify client via Ably
  await publishPhotoUploaded(galleryId, { photoId, filename, thumbnailUrl });
  
  return Response.json({ success: true });
}
```

## Kesimpulan

Arsitektur hybrid ini memberikan:
- ✅ Next.js tetap di VPS dengan PostgreSQL + Prisma (familiar)
- ✅ Workers di Cloudflare Edge (auto-scaling, no maintenance)
- ✅ Image processing via Cloudinary API (tidak perlu sharp.js di Workers)
- ✅ Database tetap di VPS (tidak perlu migrate ke D1)
- ✅ Queue system yang reliable (Cloudflare Queue)

**Trade-off:**
- ⚠️ Latency: Worker → VPS callback ada network hop tambahan
- ⚠️ Complexity: Dual environment (VPS + Cloudflare)

Tapi untuk scale dan reliability, ini adalah pilihan yang bagus!

---

Mau saya buatkan contoh kode lengkap untuk implementasi Opsi B ini?
