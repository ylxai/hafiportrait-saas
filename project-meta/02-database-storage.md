# PhotoStudio SaaS — Database & Storage

> Everything about the data layer, schema, storage architecture, and known issues.

---

## 1. Database (Neon PostgreSQL + Prisma Accelerate)

### Connection
- **Read/Write**: `DATABASE_URL=prisma+postgres://accelerate.prisma-data.net/?api_key=...` (via Accelerate)
- **Migrations/DDL**: `DIRECT_URL=postgresql://...` (raw Neon connection)
- **Client**: `src/generated/prisma/` — DO NOT EDIT directly
- **Critical Rule**: Schema changes require `db:push` with `DIRECT_URL`, NOT the `prisma://` URL

### Operations
```bash
npm run db:push      # Push schema to Neon (uses DIRECT_URL)
npm run db:generate  # Generate Prisma client
npm run db:seed      # Run seed script
```

### Generated Client Pitfall
`withAccelerate()` changes the Prisma client type — TypeScript cannot infer callback types:

```typescript
import { Prisma } from '@/generated/prisma'

// Transaction callbacks MUST be typed explicitly
await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
  // ...operations...
})
```

---

## 2. Schema (prisma/schema.prisma)

### Core Models

| Model | Key Fields | Purpose |
|---|---|---|
| **`User`** | id, email, password, role | Admin accounts only |
| **`Client`** | id, nama, email, phone, storageQuotaGB, usedStorage, photoCount, isApproved | Client data + atomic quota tracking |
| **`Event`** | id, kodeBooking, clientId, packageId, namaProject, eventDate, status, totalPrice, paidAmount, paymentStatus | Client booking/event |
| **`Package`** | id, nama, price, duration, fitur[], maxSelection, maxDownload, isActive | Service template |
| **`Payment`** | id, eventId, amount, uniqueCode, type, method, proofUrl, status | Payment records |
| **`Gallery`** | id, eventId, namaProject, clientToken, status, maxSelection, enableDownload, viewCount, isSelectionLocked | Gallery config |
| **`Photo`** | id, galleryId, filename, url, thumbnailUrl, publicId, r2Key, width, height, fileSize, order | Individual photos |
| **`Selection`** | id, galleryId, submittedAt | Client photo selections |
| **`StorageAccount`** | id, name, provider, cloudName, apiKey, apiSecret, isDefault, usedStorage, totalPhotos, lastUsedAt | Cloud storage credentials |
| **`FailedJob`** | id, outboxType, payload, attempts, lastAttemptAt, error | Outbox for retry (CQRS pattern) |
| **`UploadAnalytics`** | id, galleryId, hashClient, responseTime, userAgent | Upload perf tracking |

### Indexes (Partial List)
- `Event`: clientId, eventDate, paymentStatus, status, (status, createdAt), (clientId, eventDate), (paymentStatus, eventDate)
- `Client`: createdAt, nama, isApproved
- `Photo`: galleryId, order, createdAt, (status, eventDate) composite

### Relationships & Cascades
```
Client 1──∞ Event 1──∞ Gallery 1──∞ Photo
Event 1──∞ Payment
Event 1──0..1 Package (nullable)
Gallery 1──∞ Selection 1──∞ SelectionPhoto 1──0..1 Photo
Client 1──0..∞ Photo (direct, for orphan cleanup)
```

**Cascade Rules (Critical):**
- `Client` → `Event` → `Gallery` → `Photo` (all `onDelete: Cascade`)
- Deleting a Client triggers cascade delete through all events/galleries/photos → automatically queues storage cleanup via route handler
- Without `onDelete: Cascade`, `prisma.client.delete()` fails with FK RESTRICT

---

## 3. Storage Architecture

### Two-Provider Pattern

| Provider | Purpose | Credentials |
|---|---|---|
| **Cloudflare R2** | Original file storage (full-res) | From `StorageAccount` table (NOT `.env`) |
| **Cloudinary** | Thumbnails ONLY (optimized, cached) | From `StorageAccount` table (NOT `.env`) |

### Upload Flow (Direct → R2)

1. Client requests presigned URL → `POST /api/admin/upload/presigned`
2. Client uploads **directly** to R2 (bypasses Next.js server)
3. Client calls `POST /api/admin/upload/complete` → queues thumbnail generation
4. Cloudflare Worker picks up queue → generates thumbnail → uploads to Cloudinary
5. Webhook confirmation back to Next.js app

### Why Credentials in Database? (Not .env)

Per AGENTS.md §Storage: **Credentials from DB — NOT .env**. Rationale:
- Multi-account support (multiple R2/Cloudinary buckets)
- alternative cloud storage (Okteto, MinIO) for specific client needs
- Rotatable per-account without app redeploy
- Admin-managed via dashboard (Settings → Storage Accounts)

### Storage Account Management

- **Rotation**: Automated via `/api/admin/storage-accounts/rotation/cron`
- **Usage Tracking**: Per-account `usedStorage` (BigInt), `totalPhotos` (Int) — maintained by upload/delete flows
- **Cloudinary Bug (Known)**: Cloudinary `usedStorage` displays `0.0 KB` while R2 is correct — investigation needed (likely missing `usedStorage` update in Cloudinary upload flows or aggregation query)

### Supported File Formats
`.jpg`, `.jpeg`, `.png`, `.webp`, `.heic`, `.nef`, `.cr2`, `.arw`, `.dng`, `.raw`

### Background Jobs (Cloudflare Queues)

**No Redis, No BullMQ, No PM2.**

Next.js POSTs to `CLOUDFLARE_WORKER_URL` → Worker handles queue publishing.

Key queues:
- `thumbnail-generated` — Thumbnail generation from R2 → Cloudinary
- `storage-deleted` — Cleanup R2/Cloudinary on photo deletion
- `outbox-*` — Failed job retry (CQRS)

---

## 4. BigInt & Serialization

Prisma PostgreSQL maps `Int8` to JavaScript `BigInt`, but `JSON.stringify()` cannot serialize `BigInt`:

```typescript
// ❌ Throws: "Do not know how to serialize a BigInt"
return NextResponse.json({ fileSize: photo.fileSize })

// ✅ Use serializeBigInt() helper
import { serializeBigInt } from '@/lib/bigint-utils'
return successResponse({ fileSize: serializeBigInt(photo.fileSize) })
```

`successResponse()` from `@/lib/api/response` automatically wraps with `serializeBigInt()`.

---

## 5. Known Data Issues

### Cloudinary `usedStorage` = 0.0 KB (Critical)
- Location: `src/lib/storage/accounts.ts` or `src/app/api/admin/storage-accounts/route.ts`
- Symptom: Cloudinary account shows `0.0 KB` in UI; R2 account shows correct usage
- Likely Root Cause: Upload flow does not update `usedStorage` for Cloudinary accounts, or `StorageAccount.updateMany` is missing for Cloudinary branch
- **NOT yet fixed** — requires investigation of upload complete + storage deduct paths
