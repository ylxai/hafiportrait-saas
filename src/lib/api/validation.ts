import { z } from 'zod';

// Common validation schemas
export const idSchema = z.object({
  id: z.string().trim().min(1, 'ID is required'),
});

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const searchQuerySchema = z.object({
  q: z.string().min(1, 'Search query required').max(200),
  type: z.enum(['clients', 'events', 'galleries', 'photos']).optional(),
});

// Helper to sanitize string (trim and basic XSS prevention)
// Note: For production, consider using DOMPurify for more robust sanitization
const sanitizeString = (str: string) => {
  return str
    .trim()
    .replace(/[<>]/g, '') // Remove < and > to prevent HTML tags
    .replace(/javascript:/gi, '') // Remove javascript: protocol
    .replace(/on\w+=/gi, ''); // Remove event handlers (onclick, onerror, etc.)
};

// Email regex for stricter validation
const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

// Phone regex (Indonesian format: +62 or 08)
const phoneRegex = /^(\+62|62|0)[0-9]{9,12}$/;

export const clientSchema = z.object({
  nama: z.string()
    .min(1, 'Nama wajib diisi')
    .max(100, 'Nama terlalu panjang')
    .transform(sanitizeString),
  email: z.string()
    .email('Email tidak valid')
    .regex(emailRegex, 'Format email tidak valid')
    .max(100, 'Email terlalu panjang')
    .transform((str) => str.trim().toLowerCase()),
  phone: z.string()
    .nullish()
    .refine((val) => val === null || val === undefined || phoneRegex.test(val), {
      message: 'Format nomor telepon tidak valid (gunakan 08xx atau +62)',
    }),
  instagram: z.string()
    .nullish()
    .refine((val) => val === null || val === undefined || /^@?[a-zA-Z0-9._]{1,30}$/.test(val), {
      message: 'Format Instagram tidak valid',
    }),
  storageQuotaGB: z.number()
    .int('Kuota harus berupa bilangan bulat')
    .min(1, 'Kuota minimal 1 GB')
    .max(1000, 'Kuota maksimal 1000 GB')
    .optional(),
});

export const packageSchema = z.object({
  nama: z.string()
    .min(1, 'Nama paket wajib diisi')
    .max(100, 'Nama terlalu panjang')
    .transform(sanitizeString),
  description: z.string()
    .max(500, 'Deskripsi terlalu panjang')
    .nullish()
    .transform((val) => val ? sanitizeString(val) : val),
  price: z.number().min(0, 'Harga tidak boleh negatif'),
  duration: z.number().int().positive().nullish(),
  fitur: z.array(z.string()).optional().transform((val) => val === null ? undefined : val),
  maxSelection: z.number().int().min(0).default(20),
  maxDownload: z.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
});

export const eventSchema = z.object({
  clientId: z.string().min(1, 'Client wajib dipilih'),
  packageId: z.string().nullish(),
  namaProject: z.string()
    .min(1, 'Nama project wajib diisi')
    .max(100, 'Nama project terlalu panjang')
    .transform(sanitizeString),
  eventDate: z.string()
    .refine((str) => !isNaN(Date.parse(str)), { message: 'Format tanggal tidak valid' })
    .transform((str) => new Date(str)),
  location: z.string()
    .max(200, 'Lokasi terlalu panjang')
    .nullish()
    .transform((val) => val ? sanitizeString(val) : val),
  notes: z.string()
    .max(500, 'Catatan terlalu panjang')
    .nullish()
    .transform((val) => val ? sanitizeString(val) : val),
  totalPrice: z.number().int().min(0).default(0),
  status: z.enum(['pending', 'confirmed', 'completed', 'cancelled']).default('pending'),
  paymentStatus: z.enum(['unpaid', 'partial', 'paid']).default('unpaid'),
});

export const gallerySchema = z.object({
  eventId: z.string().min(1, 'Event wajib dipilih'),
  namaProject: z.string()
    .min(1, 'Nama project wajib diisi')
    .max(100, 'Nama project terlalu panjang')
    .transform(sanitizeString),
  maxSelection: z.number().int().min(0).default(20),
  status: z.enum(['draft', 'published', 'archived']).default('draft'),
  enableDownload: z.boolean().default(false),
  welcomeMessage: z.string()
    .max(500, 'Pesan terlalu panjang')
    .optional()
    .transform((val) => val ? sanitizeString(val) : val),
  thankYouMessage: z.string()
    .max(500, 'Pesan terlalu panjang')
    .optional()
    .transform((val) => val ? sanitizeString(val) : val),
  bannerClientName: z.string()
    .max(100, 'Nama terlalu panjang')
    .optional()
    .transform((val) => val ? sanitizeString(val) : val),
  bannerEventDate: z.string()
    .max(100, 'Tanggal terlalu panjang')
    .optional()
    .transform((val) => val ? sanitizeString(val) : val),
});

export const bookingSchema = z.object({
  nama: z.string()
    .min(1, 'Nama wajib diisi')
    .max(100, 'Nama terlalu panjang')
    .transform(sanitizeString),
  email: z.string()
    .email('Email tidak valid')
    .regex(emailRegex, 'Format email tidak valid')
    .max(100, 'Email terlalu panjang')
    .transform((str) => str.trim().toLowerCase()),
  phone: z.string()
    .min(1, 'Nomor WhatsApp wajib diisi')
    .regex(phoneRegex, 'Format nomor telepon tidak valid (gunakan 08xx atau +62)'),
  instagram: z.string()
    .optional()
    .refine((val) => val === undefined || val === '' || /^[a-zA-Z0-9._]{1,30}$/.test(val), {
      message: 'Format Instagram tidak valid',
    }),
  packageId: z.string().optional(),
  eventDate: z.string()
    .refine((str) => !isNaN(Date.parse(str)), { message: 'Format tanggal tidak valid' })
    .transform((str) => new Date(str)),
  location: z.preprocess(
    (val) => (val === '' ? undefined : val),
    z.string().max(200, 'Lokasi terlalu panjang').optional().transform((val) => val ? sanitizeString(val) : val)
  ),
  notes: z.preprocess(
    (val) => (val === '' ? undefined : val),
    z.string().max(500, 'Catatan terlalu panjang').optional().transform((val) => val ? sanitizeString(val) : val)
  ),
});

export const selectionSubmitSchema = z.object({
  photoIds: z.array(z.string()).min(1, 'Pilih minimal 1 foto'),
});

export const updateGallerySchema = z.object({
  namaProject: z.string()
    .min(1, 'Nama project tidak boleh kosong')
    .max(100, 'Nama project terlalu panjang')
    .optional()
    .transform((val) => val ? sanitizeString(val) : val),
  maxSelection: z.number().int().min(0).optional(),
  status: z.enum(['draft', 'published', 'archived']).optional(),
  enableDownload: z.boolean().optional(),
  welcomeMessage: z.string()
    .max(500, 'Pesan terlalu panjang')
    .nullable()
    .optional()
    .transform((val) => val ? sanitizeString(val) : val),
  thankYouMessage: z.string()
    .max(500, 'Pesan terlalu panjang')
    .nullable()
    .optional()
    .transform((val) => val ? sanitizeString(val) : val),
  bannerClientName: z.string()
    .max(100, 'Nama terlalu panjang')
    .nullable()
    .optional()
    .transform((val) => val ? sanitizeString(val) : val),
  bannerEventDate: z.string()
    .max(100, 'Tanggal terlalu panjang')
    .nullable()
    .optional()
    .transform((val) => val ? sanitizeString(val) : val),
});

export const loginSchema = z.object({
  email: z.string().email('Email tidak valid'),
  password: z.string().min(1, 'Password wajib diisi'),
});

// Partial schemas for PATCH endpoints (all fields optional)
export const eventUpdateSchema = eventSchema.partial();
export const clientUpdateSchema = clientSchema.partial();
export const packageUpdateSchema = packageSchema.partial();

// Helper function to validate and return error response
export function validateRequest<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): { success: true; data: T } | { success: false; error: string } {
  const result = schema.safeParse(data);
  if (!result.success) {
    const firstError = result.error.errors[0];
    return {
      success: false,
      error: firstError.path.length > 0
        ? `${firstError.path.join('.')}: ${firstError.message}`
        : firstError.message,
    };
  }
  return { success: true, data: result.data };
}