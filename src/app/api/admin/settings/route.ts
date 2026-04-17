import { prisma } from '@/lib/db';
import { successResponse, errorResponse, serverErrorResponse } from '@/lib/api/response';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';
import { Prisma } from '@/generated/prisma';
import { z } from 'zod';

// Zod schema for settings update
const updateSettingsSchema = z.object({
  namaStudio: z.string().max(100, 'Nama studio terlalu panjang').optional(),
  logoUrl: z.string().url('URL logo tidak valid').max(500).optional(),
  phone: z.string().regex(/^(\+62|62|0)[0-9]{9,12}$/, 'Format nomor telepon tidak valid').optional(),
  email: z.string().email('Email tidak valid').max(100).optional(),
  address: z.string().max(500, 'Alamat terlalu panjang').optional(),
  socialMedia: z.record(z.string(), z.string().url()).optional(),
  bookingFields: z.record(z.string(), z.unknown()).optional(),
  notifications: z.record(z.string(), z.unknown()).optional(),
});

// Get studio settings (single row with id="studio")
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return errorResponse('Unauthorized', 401);
    }

    const settings = await prisma.settings.findUnique({
      where: { id: 'studio' },
    });

    // Return default settings if not found
    const defaultSettings = {
      id: 'studio',
      namaStudio: '',
      logoUrl: '',
      phone: '',
      email: '',
      address: '',
      socialMedia: {},
      bookingFields: {},
      notifications: {},
    };

    return successResponse({ 
      settings: settings || defaultSettings 
    });
  } catch (error) {
    console.error('Error fetching settings:', error);
    return serverErrorResponse('Failed to fetch settings');
  }
}

// Update studio settings
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return errorResponse('Unauthorized', 401);
    }

    const body = await request.json();
    
    // Validate request body
    const validation = updateSettingsSchema.safeParse(body);
    if (!validation.success) {
      const firstError = validation.error.errors[0];
      return errorResponse(`${firstError.path.join('.')}: ${firstError.message}`, 400);
    }

    const data = validation.data;

    // Upsert settings (create if not exists, update if exists)
    const settings = await prisma.settings.upsert({
      where: { id: 'studio' },
      update: {
        namaStudio: data.namaStudio,
        logoUrl: data.logoUrl,
        phone: data.phone,
        email: data.email,
        address: data.address,
        socialMedia: data.socialMedia as Prisma.InputJsonValue,
        bookingFields: data.bookingFields as Prisma.InputJsonValue,
        notifications: data.notifications as Prisma.InputJsonValue,
      },
      create: {
        id: 'studio',
        namaStudio: data.namaStudio || '',
        logoUrl: data.logoUrl || '',
        phone: data.phone || '',
        email: data.email || '',
        address: data.address || '',
        socialMedia: (data.socialMedia ?? {}) as Prisma.InputJsonValue,
        bookingFields: (data.bookingFields ?? {}) as Prisma.InputJsonValue,
        notifications: (data.notifications ?? {}) as Prisma.InputJsonValue,
      },
    });

    return successResponse({ settings });
  } catch (error) {
    console.error('Error saving settings:', error);
    return serverErrorResponse('Failed to save settings');
  }
}
