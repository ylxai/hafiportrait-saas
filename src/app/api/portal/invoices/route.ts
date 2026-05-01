import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';
import { prisma } from '@/lib/db';
import { successResponse, unauthorizedResponse, serverErrorResponse } from '@/lib/api/response';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'CLIENT') {
      return unauthorizedResponse();
    }

    const payments = await prisma.payment.findMany({
      where: {
        event: {
          clientId: session.user.id
        }
      },
      include: {
        event: {
          select: {
            namaProject: true,
            eventDate: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    return successResponse({ payments });
  } catch (error) {
    console.error('Invoices API error:', error);
    return serverErrorResponse('Failed to fetch invoices');
  }
}
