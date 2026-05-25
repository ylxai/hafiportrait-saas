import { prisma } from '@/lib/db';
import { successResponse, notFoundResponse, serverErrorResponse } from '@/lib/api/response';
import { withRequestContext } from '@/lib/with-request-context';
import { logger } from '@/lib/logger';

export const GET = withRequestContext(async (
  request: Request,
  { params }: { params: Promise<{ kodeBooking: string }> }
) => {
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
      return notFoundResponse('Booking not found');
    }
    
    return successResponse(event);
  } catch (error) {
    logger.error('public.booking.fetch_failed', { err: error });
    return serverErrorResponse('Failed to fetch booking data');
  }
});
