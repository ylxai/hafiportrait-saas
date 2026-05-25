import { NextResponse } from 'next/server';
import { requireClientAuth } from '@/lib/auth/require-client-auth';
import { prisma } from '@/lib/db';
import { successResponse, serverErrorResponse } from '@/lib/api/response';
import { withRequestContext } from '@/lib/with-request-context';

export const GET = withRequestContext(async () => {
  try {
    const auth = await requireClientAuth();
    if (auth instanceof NextResponse) return auth;

    const payments = await prisma.payment.findMany({
      where: {
        event: {
          clientId: auth.user.id
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
      },
      take: 50
    });

    return successResponse({ payments });
  } catch (error) {
    console.error('Invoices API error:', error);
    return serverErrorResponse('Failed to fetch invoices');
  }
});
