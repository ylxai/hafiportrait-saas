import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { successResponse, notFoundResponse, serverErrorResponse, errorResponse } from '@/lib/api/response';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';

async function checkAuth() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return errorResponse('Unauthorized', 401);
  }
  return session;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await checkAuth();
    if (auth instanceof NextResponse) return auth;

    const { id } = await params;

    const event = await prisma.event.findUnique({
      where: { id },
      include: {
        client: true,
        package: true,
      },
    });

    if (!event) {
      return notFoundResponse('Event not found');
    }

    return successResponse({ event });
  } catch (error) {
    console.error('Error fetching event:', error);
    return serverErrorResponse('Failed to fetch event');
  }
}
