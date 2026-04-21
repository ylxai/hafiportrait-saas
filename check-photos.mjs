import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const photos = await prisma.photo.findMany({
  orderBy: { createdAt: 'desc' },
  take: 5,
  select: {
    id: true,
    filename: true,
    thumbnailUrl: true,
    createdAt: true,
  },
});

console.log('Recent photos:');
photos.forEach(p => {
  console.log(`- ${p.filename}`);
  console.log(`  ID: ${p.id}`);
  console.log(`  Thumbnail: ${p.thumbnailUrl || 'NULL'}`);
  console.log(`  Created: ${p.createdAt}`);
  console.log('');
});

await prisma.$disconnect();
