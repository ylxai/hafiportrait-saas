import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { successResponse, unauthorizedResponse, handlePrismaError, errorResponse } from '@/lib/api/response';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';

async function checkAuth() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return unauthorizedResponse();
  }
  return session;
}

export async function GET(request: Request) {
  try {
    const auth = await checkAuth();
    if (auth instanceof NextResponse) return auth;

    // Rate limiting
    const rateLimit = await checkRateLimit(auth.user.email, RATE_LIMITS.SEARCH);
    if (!rateLimit.success) {
      return errorResponse('Too many requests. Please try again later.', 429);
    }

    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q') || '';
    const type = searchParams.get('type') || 'all'; // all, galleries, events, clients

    if (!query || query.length < 2) {
      return successResponse({ galleries: [], events: [], clients: [] });
    }

    // Parallel queries for better performance
    const [galleries, events, clients] = await Promise.all([
      (type === 'all' || type === 'galleries') ? prisma.gallery.findMany({
      where: {
        OR: [
          { namaProject: { contains: query, mode: 'insensitive' } },
          { event: { namaProject: { contains: query, mode: 'insensitive' } } },
        ],
      },
      select: {
        id: true,
        namaProject: true,
        status: true,
        createdAt: true,
        event: {
          select: {
            namaProject: true,
            client: { select: { nama: true } },
          },
        },
      },
        take: 10,
      }) : Promise.resolve([]),
      (type === 'all' || type === 'events') ? prisma.event.findMany({
      where: {
        OR: [
          { namaProject: { contains: query, mode: 'insensitive' } },
          { kodeBooking: { contains: query, mode: 'insensitive' } },
          { client: { nama: { contains: query, mode: 'insensitive' } } },
        ],
      },
      select: {
        id: true,
        kodeBooking: true,
        namaProject: true,
        eventDate: true,
        status: true,
        client: { select: { nama: true } },
      },
        take: 10,
      }) : Promise.resolve([]),
      (type === 'all' || type === 'clients') ? prisma.client.findMany({
      where: {
        OR: [
          { nama: { contains: query, mode: 'insensitive' } },
          { email: { contains: query, mode: 'insensitive' } },
          { phone: { contains: query, mode: 'insensitive' } },
        ],
      },
      select: {
        id: true,
        nama: true,
        email: true,
        phone: true,
        createdAt: true,
      },
        take: 10,
      }) : Promise.resolve([]),
    ]);

    return successResponse({
      query,
      galleries,
      events,
      clients,
      total: galleries.length + events.length + clients.length,
    });
  } catch (error) {
    console.error('[API] Error searching:', error);
    return handlePrismaError(error);
  }
}
