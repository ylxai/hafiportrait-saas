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

    const galleries = await prisma.gallery.findMany({
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
        },
        _count: {
          select: {
            photos: true,
            selections: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

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
      take: 5
    });

    return successResponse({ galleries, payments });
  } catch (error) {
    console.error('Dashboard API error:', error);
    return serverErrorResponse('Failed to fetch dashboard data');
  }
});
