import { PrismaClient } from "@/generated/prisma";
import * as bcrypt from "bcryptjs";

const prisma = new PrismaClient({
  datasourceUrl: process.env.TEST_DATABASE_URL || process.env.DATABASE_URL,
});

export interface TestClient {
  id: string;
  nama: string;
  email: string;
  phone: string | null;
  instagram: string | null;
  password: string | null;
  storageQuotaGB: number;
  emailVerified: boolean;
  verificationToken: string | null;
  tokenExpiry: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface TestEvent {
  id: string;
  kodeBooking: string;
  clientId: string;
  packageId: string | null;
  namaProject: string;
  eventDate: Date;
  location: string | null;
  notes: string | null;
  status: string;
  totalPrice: number;
  paidAmount: number;
  paymentStatus: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface TestGallery {
  id: string;
  eventId: string;
  namaProject: string;
  clientToken: string;
  status: string;
  maxSelection: number;
  enableDownload: boolean;
  welcomeMessage: string | null;
  thankYouMessage: string | null;
  bannerClientName: string | null;
  bannerEventDate: string | null;
  bannerMessage: string | null;
  viewCount: number;
  isSelectionLocked: boolean;
  createdAt: Date;
  updatedAt: Date;
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
  thumbnailUrl: string | null;
  publicId: string | null;
  r2Key: string | null;
  width: number | null;
  height: number | null;
  order: number;
  fileSize: bigint | null;
  fileHash: string | null;
  createdAt: Date;
  storageAccountId: string | null;
  cloudinaryAccountId: string | null;
}

export interface TestPayment {
  id: string;
  eventId: string;
  amount: number;
  uniqueCode: number;
  type: string;
  method: string;
  proofUrl: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
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
    },
  });

  return photo;
}

export async function seedPayment(
  eventId: string,
  data?: Partial<TestPayment>,
): Promise<TestPayment> {
  const payment = await prisma.payment.create({
    data: {
      eventId,
      amount: data?.amount || 2500000,
      uniqueCode: Math.floor(Math.random() * 900) + 100,
      type: data?.type || "dp",
      method: data?.method || "transfer",
      status: data?.status || "approved",
      proofUrl: "https://test.cloudinary.com/proof.jpg",
    },
  });

  return payment;
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
