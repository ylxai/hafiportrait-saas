import { prisma } from '@/lib/db';
import { successResponse, serverErrorResponse } from '@/lib/api/response';
import { bookingSchema } from '@/lib/api/validation';
import { generateKodeBooking } from '@/lib/utils';

const MAX_RETRY = 5;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const validated = bookingSchema.parse(body);

    let client = await prisma.client.findFirst({
      where: { email: validated.email },
    });

    if (!client) {
      client = await prisma.client.create({
        data: {
          nama: validated.nama,
          email: validated.email,
          phone: validated.phone,
          instagram: validated.instagram,
        },
      });
    }

    let packageData = null;
    if (validated.packageId) {
      packageData = await prisma.package.findUnique({
        where: { id: validated.packageId },
      });
    }

    // Retry pattern for unique kode booking
    let event = null;
    let kodeBooking = '';
    
    for (let attempt = 0; attempt < MAX_RETRY; attempt++) {
      kodeBooking = generateKodeBooking();
      
      try {
        event = await prisma.event.create({
          data: {
            kodeBooking,
            clientId: client.id,
            packageId: validated.packageId || null,
            namaProject: `Project ${client.nama}`,
            eventDate: validated.eventDate,
            location: validated.location || '',
            notes: validated.notes || '',
            totalPrice: packageData?.price || 0,
            status: 'pending',
            paymentStatus: 'unpaid',
          },
        });
        break;
      } catch (error: unknown) {
        if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') {
          console.warn(`Kode booking collision, retry ${attempt + 1}/${MAX_RETRY}`);
          continue;
        }
        throw error;
      }
    }

    if (!event) {
      return serverErrorResponse('Failed to generate unique kode booking');
    }

    return successResponse({ event, kodeBooking }, 201);
  } catch (error) {
    console.error('Error creating booking:', error);
    return serverErrorResponse('Failed to create booking');
  }
}