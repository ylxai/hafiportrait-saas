# Database Optimization Patches
**Generated:** 2026-05-13  
**Priority:** HIGH → MEDIUM → LOW

---

## PATCH 1: Fix N+1 Query in Client Listing (HIGH PRIORITY)

**File:** `src/app/api/admin/clients/route.ts`  
**Lines:** 64-86  
**Impact:** 100x query reduction (101 queries → 1 query)

### Current Implementation (SLOW)
```typescript
// Fetch storage usage for each client
const clientsWithUsage = await Promise.all(
  clients.map(async (client: typeof clients[number]) => {
    const usage = await prisma.photo.aggregate({
      where: {
        gallery: {
          event: {
            clientId: client.id,
          },
        },
      },
      _sum: {
        fileSize: true,
      },
      _count: true,
    });

    return {
      ...client,
      usedStorageBytes: (usage._sum.fileSize || BigInt(0)).toString(),
      photoCount: usage._count,
    };
  })
);
```

### Optimized Implementation (FAST)
```typescript
// Use Client.usedStorage field (already maintained atomically)
const clients = await prisma.client.findMany({
  orderBy: { createdAt: 'desc' },
  take: limit,
  skip,
  select: {
    id: true,
    nama: true,
    email: true,
    phone: true,
    instagram: true,
    storageQuotaGB: true,
    usedStorage: true, // ← Already tracked atomically
    isApproved: true,
    createdAt: true,
    updatedAt: true,
  },
});

// Simple map, no additional queries
const clientsWithUsage = clients.map((client) => ({
  ...client,
  usedStorageBytes: client.usedStorage.toString(),
}));
```

---

## PATCH 2: Fix N+1 Query in Quota Check (HIGH PRIORITY)

**File:** `src/app/api/admin/clients/quota/route.ts`  
**Lines:** 90-102  
**Impact:** Eliminate redundant aggregate query

### Optimized Implementation
```typescript
const client = await prisma.client.findUnique({
  where: { id: clientId },
  select: {
    id: true,
    nama: true,
    email: true,
    storageQuotaGB: true,
    usedStorage: true,
  },
});

if (!client) {
  return errorResponse('Client not found', 404);
}

const totalUsed = client.usedStorage;
const quotaBytes = BigInt(client.storageQuotaGB) * BigInt(BYTES_PER_GB);
const usagePercent = quotaBytes > BigInt(0) 
  ? Number((totalUsed * BigInt(10000)) / quotaBytes) / 100 
  : 0;
```

---

## PATCH 3: Add Pagination to Export (HIGH PRIORITY)

**Files:** `src/app/api/admin/export/clients/route.ts`

### Add cursor-based streaming with MAX_EXPORT limit of 50000 records

---

## PATCH 4: Wrap Bulk Delete in Transaction (MEDIUM)

**File:** `src/app/api/admin/galleries/bulk/route.ts`

```typescript
await prisma.$transaction([
  prisma.gallery.deleteMany({ where: { id: { in: ids } } }),
  ...Array.from(usedByClient.entries())
    .filter(([, bytes]) => bytes > BigInt(0))
    .map(([clientId, bytes]) =>
      prisma.client.update({
        where: { id: clientId },
        data: { usedStorage: { decrement: bytes } },
      })
    ),
]);
```

---

## PATCH 5: Use findUnique for Duplicate Detection (MEDIUM)

**File:** `src/lib/upload/duplicate-detection.ts`

```typescript
const existingPhoto = await prisma.photo.findUnique({
  where: {
    uniq_gallery_filehash: { galleryId, fileHash }
  },
  select: {
    id: true,
    filename: true,
    url: true,
    thumbnailUrl: true,
  },
});
```

---

## PATCH 6: Add Transaction to Selection Submission (MEDIUM)

**File:** `src/app/api/public/gallery/[token]/submit/route.ts`

Wrap selection creation in transaction to prevent race conditions.

---

## Monitoring Query

```sql
-- Check Client.usedStorage accuracy
SELECT 
  c.id,
  c.nama,
  c."usedStorage" as tracked_storage,
  COALESCE(SUM(p."fileSize"), 0) as actual_storage,
  c."usedStorage" - COALESCE(SUM(p."fileSize"), 0) as difference
FROM "Client" c
LEFT JOIN "Event" e ON e."clientId" = c.id
LEFT JOIN "Gallery" g ON g."eventId" = e.id
LEFT JOIN "Photo" p ON p."galleryId" = g.id
GROUP BY c.id, c.nama, c."usedStorage"
HAVING c."usedStorage" - COALESCE(SUM(p."fileSize"), 0) != 0
ORDER BY ABS(c."usedStorage" - COALESCE(SUM(p."fileSize"), 0)) DESC
LIMIT 20;
```
