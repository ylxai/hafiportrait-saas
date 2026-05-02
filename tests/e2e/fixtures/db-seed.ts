import { PrismaClient } from "@/generated/prisma";
import * as bcrypt from "bcryptjs";

const prisma = new PrismaClient({
  datasourceUrl: process.env.TEST_DATABASE_URL || process.env.DATABASE_URL,
});

export interface TestClient {
  id: string;
  nama: string;
  email: string;
  phone?: string;
  password?: string;
}

export interface TestEvent {
  id: string;
  kodeBooking: string;
  clientId: string;
  namaProject: string;
  eventDate: Date;
  status: string;
}

export interface TestGallery {
  id: string;
  eventId: string;
  namaProject: string;
  clientToken: string;
  status: string;
}

export async function seedClient(
  data?: Partial<TestClient>,
): Promise<TestClient> {
  const timestamp = Date.now();
  const hashedPassword = data?.password
    ? await bcrypt.hash(data.password, 10)
    : undefined;

  const client = await prisma.client.create({
    data: {
      nama: data?.nama || `Test Client ${timestamp}`,
      email: data?.email || `client${timestamp}@test.com`,
      phone: data?.phone || `+62812${timestamp.toString().slice(-8)}`,
      password: hashedPassword,
      emailVerified: true,
    },
  });

  return client;
}

export async function seedEvent(
  clientId: string,
  data?: Partial<TestEvent>,
): Promise<TestEvent> {
  const timestamp = Date.now();

  const event = await prisma.event.create({
    data: {
      kodeBooking: data?.kodeBooking || `BK${timestamp}`,
      clientId,
      namaProject: data?.namaProject || `Test Event ${timestamp}`,
      eventDate: data?.eventDate || new Date(),
      status: data?.status || "confirmed",
      totalPrice: 5000000,
      paidAmount: 0,
      paymentStatus: "unpaid",
    },
  });

  return event;
}

export async function seedGallery(
  eventId: string,
  data?: Partial<TestGallery>,
): Promise<TestGallery> {
  const timestamp = Date.now();

  const gallery = await prisma.gallery.create({
    data: {
      eventId,
      namaProject: data?.namaProject || `Test Gallery ${timestamp}`,
      status: data?.status || "published",
      maxSelection: 20,
      enableDownload: true,
    },
  });

  return gallery;
}

export interface TestPhoto {
  id: string;
  galleryId: string;
  filename: string;
  url: string;
}

export async function seedPhoto(
  galleryId: string,
  data?: Partial<TestPhoto>,
): Promise<TestPhoto> {
  const timestamp = Date.now();

  const photo = await prisma.photo.create({
    data: {
      galleryId,
      filename: data?.filename || `test-photo-${timestamp}.jpg`,
      url:
        data?.url || `https://test.cloudinary.com/test-photo-${timestamp}.jpg`,
      thumbnailUrl: `https://test.cloudinary.com/test-photo-${timestamp}-thumb.jpg`,
      fileSize: BigInt(1024000),
      width: 1920,
      height: 1080,
      format: "jpg",
      uploadedAt: new Date(),
    },
  });

  return photo;
}

export async function seedFullTestData() {
  const client = await seedClient({
    nama: "E2E Test Client",
    email: "e2e@test.com",
    password: "test123",
  });
  const event = await seedEvent(client.id, { namaProject: "E2E Test Event" });
  const gallery = await seedGallery(event.id, {
    namaProject: "E2E Test Gallery",
  });

  return { client, event, gallery };
}

export { prisma };
