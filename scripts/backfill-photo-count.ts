#!/usr/bin/env tsx
/**
 * Backfill photoCount column for existing clients
 * 
 * This script counts actual photos per client and updates the photoCount column.
 * Run once after adding the photoCount column to the schema.
 * 
 * Usage:
 *   npx tsx scripts/backfill-photo-count.ts
 */

import { PrismaClient } from '../src/generated/prisma/index.js';

const prisma = new PrismaClient();

async function main() {
  console.log('[Backfill] Starting photoCount backfill...');

  // Get all clients
  const clients = await prisma.client.findMany({
    select: { id: true, nama: true },
  });

  console.log(`[Backfill] Found ${clients.length} clients`);

  let updated = 0;
  let skipped = 0;

  for (const client of clients) {
    // Count photos for this client across all their events and galleries
    const photoCount = await prisma.photo.count({
      where: {
        gallery: {
          event: {
            clientId: client.id,
          },
        },
      },
    });

    // Update the client's photoCount
    await prisma.client.update({
      where: { id: client.id },
      data: { photoCount },
    });

    if (photoCount > 0) {
      console.log(`[Backfill] ${client.nama}: ${photoCount} photos`);
      updated++;
    } else {
      skipped++;
    }
  }

  console.log(`[Backfill] Complete!`);
  console.log(`[Backfill] Updated: ${updated} clients`);
  console.log(`[Backfill] Skipped (0 photos): ${skipped} clients`);
}

main()
  .catch((err) => {
    console.error('[Backfill] Error:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
