import { prisma } from '@/lib/db';
import { successResponse, notFoundResponse, serverErrorResponse } from '@/lib/api/response';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ kodeBooking: string }> }
) {
  try {
    const { kodeBooking } = await params;

    const event = await prisma.event.findUnique({
      where: { kodeBooking },
      include: {
        client: {
          select: {
            nama: true,
            email: true,
            phone: true,
            instagram: true,
          },
        },
        package: {
          select: {
            nama: true,
            description: true,
            price: true,
            fitur: true,
          },
        },
        payments: {
          orderBy: {
            createdAt: 'desc',
          },
        },
      },
    });

    if (!event) {
      return notFoundResponse('Booking tidak ditemukan');
    }

    // Convert BigInt or other types if necessary as per AGENTS.md
    // totalAmount and paidAmount are Int in schema, so they are fine.
    
    return successResponse(event);
  } catch (error) {
    console.error('Error fetching booking:', error);
    return serverErrorResponse('Gagal mengambil data booking');
  }
}
