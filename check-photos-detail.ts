import { prisma } from './src/lib/db';

async function main() {
  const photos = await prisma.photo.findMany({
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: { id: true, filename: true, createdAt: true, url: true }
  });
  console.log(photos);
  
  const minMax = await prisma.photo.aggregate({
    _min: { createdAt: true },
    _max: { createdAt: true },
  });
  console.log('Date range:', minMax);
}

main().catch(console.error).finally(() => prisma.$disconnect());
