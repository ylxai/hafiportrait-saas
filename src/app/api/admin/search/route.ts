import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { successResponse, unauthorizedResponse, handlePrismaError } from '@/lib/api/response';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';

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

    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q') || '';
    const type = searchParams.get('type') || 'all'; // all, galleries, events, clients

    if (!query || query.length < 2) {
      return successResponse({ galleries: [], events: [], clients: [] });
    }

    // Search galleries
    const galleries = (type === 'all' || type === 'galleries') ? await prisma.gallery.findMany({
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
    }) : [];

    // Search events
    const events = (type === 'all' || type === 'events') ? await prisma.event.findMany({
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
    }) : [];

    // Search clients
    const clients = (type === 'all' || type === 'clients') ? await prisma.client.findMany({
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
    }) : [];

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
