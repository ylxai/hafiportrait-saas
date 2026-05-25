import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';
import { isClientSession } from '@/lib/auth/role-helpers';
import { prisma } from '@/lib/db';
import { successResponse, unauthorizedResponse, serverErrorResponse } from '@/lib/api/response';
import { withRequestContext } from '@/lib/with-request-context';

export const GET = withRequestContext(async () => {
  try {
    const session = await getServerSession(authOptions);
    if (!isClientSession(session)) {
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
      },
      take: 50
    });

    return successResponse({ payments });
  } catch (error) {
    console.error('Invoices API error:', error);
    return serverErrorResponse('Failed to fetch invoices');
  }
});
