import { prisma } from './db-seed';

export async function cleanupClient(clientId: string) {
  await prisma.client.delete({ where: { id: clientId } });
}

export async function cleanupEvent(eventId: string) {
  await prisma.event.delete({ where: { id: eventId } });
}

export async function cleanupGallery(galleryId: string) {
  await prisma.gallery.delete({ where: { id: galleryId } });
}

export async function cleanupAllTestData() {
  await prisma.photoSelection.deleteMany();
  await prisma.selection.deleteMany();
  await prisma.photo.deleteMany();
  await prisma.gallery.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.event.deleteMany();
  await prisma.client.deleteMany({ where: { email: { contains: '@test.com' } } });
}

export async function cleanupByEmail(email: string) {
  const client = await prisma.client.findUnique({ where: { email } });
  if (client) {
    await cleanupClient(client.id);
  }
}

// Global teardown - only disconnect once at the end of all tests
export async function disconnectPrisma() {
  await prisma.$disconnect();
}
