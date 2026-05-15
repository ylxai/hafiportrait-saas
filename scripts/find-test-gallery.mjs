import { PrismaClient } from '../src/generated/prisma/index.js';
const p = new PrismaClient();
const rows = await p.gallery.findMany({
  where: { shareToken: { not: null }, status: 'PUBLIC' },
  orderBy: { updatedAt: 'desc' },
  select: {
    id: true, shareToken: true, title: true, viewCount: true,
    _count: { select: { photos: true } },
  },
  take: 8,
});
console.log(JSON.stringify(rows, null, 2));
await p.$disconnect();
