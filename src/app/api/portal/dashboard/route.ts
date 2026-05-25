import { NextResponse } from 'next/server';
import { requireClientAuth } from '@/lib/auth/require-client-auth';
import { prisma } from '@/lib/db';
import { successResponse, serverErrorResponse } from '@/lib/api/response';
import { withRequestContext } from '@/lib/with-request-context';

export const GET = withRequestContext(async () => {
  try {
    const auth = await requireClientAuth();
    if (auth instanceof NextResponse) return auth;

    const galleries = await prisma.gallery.findMany({
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
      take: 5
    });

    return successResponse({ galleries, payments });
  } catch (error) {
    console.error('Dashboard API error:', error);
    return serverErrorResponse('Failed to fetch dashboard data');
  }
});
