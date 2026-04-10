import { z } from 'zod';

export const clientSchema = z.object({
  nama: z.string().min(1, 'Nama wajib diisi'),
  email: z.string().email('Email tidak valid'),
  phone: z.string().nullish(),
  instagram: z.string().nullish(),
});

export const packageSchema = z.object({
  nama: z.string().min(1, 'Nama paket wajib diisi'),
  description: z.string().nullish(),
  price: z.number().min(0, 'Harga tidak boleh negatif'),
  duration: z.number().int().positive().nullish(),
  fitur: z.array(z.string()).optional().transform((val) => val === null ? undefined : val),
  maxSelection: z.number().int().min(0).default(20),
  maxDownload: z.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
});

export const eventSchema = z.object({
  clientId: z.string().min(1, 'Client wajib dipilih'),
  packageId: z.string().nullish(),  // Accept null or undefined
  namaProject: z.string().min(1, 'Nama project wajib diisi'),
  eventDate: z.string()
    .refine((str) => !isNaN(Date.parse(str)), { message: 'Invalid date format' })
    .transform((str) => new Date(str)),
  location: z.string().nullish(),  // Accept null or undefined
  notes: z.string().nullish(),  // Accept null or undefined
  totalPrice: z.number().int().min(0).default(0),
  status: z.enum(['pending', 'confirmed', 'completed', 'cancelled']).default('pending'),
  paymentStatus: z.enum(['unpaid', 'partial', 'paid']).default('unpaid'),
});

export const gallerySchema = z.object({
  eventId: z.string().min(1, 'Event wajib dipilih'),
  namaProject: z.string().min(1, 'Nama project wajib diisi'),
  maxSelection: z.number().int().min(0).default(20),
  status: z.enum(['draft', 'published', 'archived']).default('draft'),
  enableDownload: z.boolean().default(false),
  welcomeMessage: z.string().optional(),
  thankYouMessage: z.string().optional(),
  bannerClientName: z.string().optional(),
  bannerEventDate: z.string().optional(),
});

export const bookingSchema = z.object({
  nama: z.string().min(1, 'Nama wajib diisi'),
  email: z.string().email('Email tidak valid'),
  phone: z.string().min(1, 'Nomor WhatsApp wajib diisi'),
  instagram: z.string().optional(),
  packageId: z.string().optional(),
  eventDate: z.string()
    .refine((str) => !isNaN(Date.parse(str)), { message: 'Invalid date format' })
    .transform((str) => new Date(str)),
  location: z.string().optional(),
  notes: z.string().optional(),
});

export const selectionSubmitSchema = z.object({
  photoIds: z.array(z.string()).min(1, 'Pilih minimal 1 foto'),
});

export const updateGallerySchema = z.object({
  namaProject: z.string().optional(),
  maxSelection: z.number().int().min(0).optional(),
  status: z.enum(['draft', 'published', 'archived']).optional(),
  enableDownload: z.boolean().optional(),
  welcomeMessage: z.string().nullable().optional(),
  thankYouMessage: z.string().nullable().optional(),
  bannerClientName: z.string().nullable().optional(),
  bannerEventDate: z.string().nullable().optional(),
});

export const loginSchema = z.object({
  email: z.string().email('Email tidak valid'),
  password: z.string().min(1, 'Password wajib diisi'),
});

// Partial schemas for PATCH endpoints (all fields optional)
export const eventUpdateSchema = eventSchema.partial();
export const clientUpdateSchema = clientSchema.partial();
export const packageUpdateSchema = packageSchema.partial();