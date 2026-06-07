import { PrismaClient } from './src/generated/prisma';

const prisma = new PrismaClient();

async function main() {
  const count = await prisma.gallery.count();
  console.log(`Gallery count: ${count}`);
  const galleries = await prisma.gallery.findMany();
  console.log('Galleries:', JSON.stringify(galleries, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
