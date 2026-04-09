import { prisma } from './src/lib/db';

async function main() {
  const count = await prisma.photo.count();
  console.log('Total photos:', count);
  
  const byGallery = await prisma.photo.groupBy({
    by: ['galleryId'],
    _count: { id: true },
  });
  console.log('By gallery:', byGallery);
  
  const byStorage = await prisma.photo.groupBy({
    by: ['storageAccountId'],
    _count: { id: true },
  });
  console.log('By storage:', byStorage);
  
  // Also check if any dummy data was seeded
  const users = await prisma.user.count();
  console.log('Users:', users);
}

main().catch(console.error).finally(() => prisma.$disconnect());
