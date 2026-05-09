/**
 * Migration script untuk fix CRITICAL #4 dan #5 di sistem storage/upload.
 *
 * Jalankan SEBELUM `npm run db:push` agar:
 *   - Kolom `Client.usedStorage` (BigInt) ter-backfill dari aggregate `Photo.fileSize`.
 *   - Duplikat `(galleryId, fileHash)` di tabel `Photo` dibersihkan, sehingga
 *     constraint `@@unique([galleryId, fileHash])` baru tidak gagal.
 *
 * Urutan kerja:
 *   1. npm run db:generate       (pastikan client lama masih kompatibel sebelum push)
 *   2. npx tsx scripts/migrate-storage-upload-critical.ts --dry-run
 *   3. npx tsx scripts/migrate-storage-upload-critical.ts
 *   4. npm run db:push
 *   5. npm run db:generate
 *
 * Catatan: Step 1–3 menggunakan schema LAMA (sebelum unique constraint).
 *          Step 4 baru menerapkan schema baru. Karena itu, pembersihan duplikat
 *          dilakukan SEBELUM push.
 */

import { PrismaClient } from '../src/generated/prisma';

const prisma = new PrismaClient();

const DRY_RUN = process.argv.includes('--dry-run');

async function dedupPhotoHashes() {
  console.log('\n=== STEP 1: Cleanup duplikat (galleryId, fileHash) ===');

  // Cari (galleryId, fileHash) yang punya >1 baris
  const duplicates = await prisma.$queryRaw<
    Array<{ galleryId: string; fileHash: string; count: bigint }>
  >`
    SELECT "galleryId", "fileHash", COUNT(*) as count
    FROM "Photo"
    WHERE "fileHash" IS NOT NULL
    GROUP BY "galleryId", "fileHash"
    HAVING COUNT(*) > 1
  `;

  console.log(`Ditemukan ${duplicates.length} grup duplikat.`);

  let deletedTotal = 0;
  for (const dup of duplicates) {
    // Pertahankan baris paling awal; hapus sisanya.
    const photos = await prisma.photo.findMany({
      where: { galleryId: dup.galleryId, fileHash: dup.fileHash },
      orderBy: { createdAt: 'asc' },
      select: { id: true, filename: true, createdAt: true },
    });
    const [keep, ...remove] = photos;
    console.log(
      `  gallery=${dup.galleryId} hash=${dup.fileHash.slice(0, 12)}… keep=${keep.filename} delete=${remove.length}`
    );
    if (!DRY_RUN && remove.length > 0) {
      const ids = remove.map((p) => p.id);
      await prisma.photo.deleteMany({ where: { id: { in: ids } } });
    }
    deletedTotal += remove.length;
  }
  console.log(`Total foto duplikat ${DRY_RUN ? 'akan dihapus' : 'dihapus'}: ${deletedTotal}`);
}

async function backfillUsedStorage() {
  console.log('\n=== STEP 2: Backfill Client.usedStorage ===');

  const clients = await prisma.client.findMany({ select: { id: true, nama: true } });
  console.log(`Backfill untuk ${clients.length} client.`);

  for (const c of clients) {
    const agg = await prisma.photo.aggregate({
      where: { gallery: { event: { clientId: c.id } } },
      _sum: { fileSize: true },
    });
    const used = agg._sum.fileSize ?? BigInt(0);
    console.log(`  ${c.nama} (${c.id}): ${used.toString()} bytes`);
    if (!DRY_RUN) {
      // Field `usedStorage` belum ada di schema lama → fallback ke executeRaw.
      // Aman dijalankan setelah db:push juga (idempotent overwrite).
      try {
        await prisma.$executeRaw`UPDATE "Client" SET "usedStorage" = ${used} WHERE "id" = ${c.id}`;
      } catch (e) {
        console.warn(
          `   ⚠ Skipped ${c.id}: kolom usedStorage belum ada. Jalankan db:push dulu, lalu re-run script ini.`
        );
        throw e;
      }
    }
  }
}

async function main() {
  console.log(DRY_RUN ? '🟡 DRY RUN — tidak ada perubahan' : '🟢 LIVE — perubahan akan diterapkan');
  await dedupPhotoHashes();
  await backfillUsedStorage();
  console.log('\n✅ Selesai.');
}

main()
  .catch((e) => {
    console.error('❌ Migration error:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
