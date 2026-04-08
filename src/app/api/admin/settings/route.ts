import { prisma } from '@/lib/db';
import { successResponse, errorResponse, serverErrorResponse } from '@/lib/api/response';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';

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
    const { 
      namaStudio, 
      logoUrl, 
      phone, 
      email, 
      address, 
      socialMedia, 
      bookingFields, 
      notifications 
    } = body;

    // Upsert settings (create if not exists, update if exists)
    const settings = await prisma.settings.upsert({
      where: { id: 'studio' },
      update: {
        namaStudio: namaStudio || undefined,
        logoUrl: logoUrl || undefined,
        phone: phone || undefined,
        email: email || undefined,
        address: address || undefined,
        socialMedia: socialMedia || undefined,
        bookingFields: bookingFields || undefined,
        notifications: notifications || undefined,
      },
      create: {
        id: 'studio',
        namaStudio: namaStudio || '',
        logoUrl: logoUrl || '',
        phone: phone || '',
        email: email || '',
        address: address || '',
        socialMedia: socialMedia || {},
        bookingFields: bookingFields || {},
        notifications: notifications || {},
      },
    });

    return successResponse({ settings });
  } catch (error) {
    console.error('Error saving settings:', error);
    return serverErrorResponse('Failed to save settings');
  }
}
