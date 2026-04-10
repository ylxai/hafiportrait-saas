import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { successResponse, serverErrorResponse, errorResponse } from '@/lib/api/response';
import { eventSchema, eventUpdateSchema } from '@/lib/api/validation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';
import { queuePhotosDeletionForEntities } from '@/lib/cloudflare-queue';

async function checkAuth() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return errorResponse('Unauthorized', 401);
  }
  return session;
}

function generateKodeBooking(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export async function GET(request: Request) {
  try {
    const auth = await checkAuth();
    if (auth instanceof NextResponse) return auth;

    const { searchParams } = new URL(request.url);
    const pageRaw = parseInt(searchParams.get('page') ?? '1', 10);
    const page = Number.isNaN(pageRaw) ? 1 : Math.max(1, pageRaw);
    const limitRaw = parseInt(searchParams.get('limit') ?? '20', 10);
    const limit = Number.isNaN(limitRaw) ? 20 : Math.min(100, Math.max(1, limitRaw));
    const skip = (page - 1) * limit;

    const [events, total] = await Promise.all([
      prisma.event.findMany({
        include: {
          client: true,
          package: true,
          galleries: {
            take: 1,
            select: {
              photos: {
                take: 1,
                orderBy: { order: 'asc' },
                select: { url: true, thumbnailUrl: true }
              }
            }
          }
        },
        orderBy: { eventDate: 'desc' },
        take: limit,
        skip,
      }),
      prisma.event.count(),
    ]);

    return successResponse({
      events,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Error fetching events:', error);
    return serverErrorResponse('Failed to fetch events');
  }
}

export async function POST(request: Request) {
  try {
    const auth = await checkAuth();
    if (auth instanceof NextResponse) return auth;

    const body = await request.json();
    const validated = eventSchema.parse(body);

    let kodeBooking = generateKodeBooking();
    let exists = await prisma.event.findUnique({ where: { kodeBooking } });
    while (exists) {
      kodeBooking = generateKodeBooking();
      exists = await prisma.event.findUnique({ where: { kodeBooking } });
    }

    const event = await prisma.event.create({
      data: {
        kodeBooking,
        ...validated,
        status: 'pending',
        paymentStatus: 'unpaid',
      },
      include: {
        client: true,
        package: true,
      },
    });

    return successResponse({ event }, 201);
  } catch (error) {
    console.error('Error creating event:', error);
    return serverErrorResponse('Failed to create event');
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await checkAuth();
    if (auth instanceof NextResponse) return auth;

    const body = await request.json();
    const { id, ...data } = body;

    if (!id) {
      return errorResponse('Event ID required', 400);
    }

    // Validate update data
    const validated = eventUpdateSchema.parse(data);

    const event = await prisma.event.update({
      where: { id },
      data: validated,
      include: { client: true, package: true },
    });

    return successResponse({ event });
  } catch (error) {
    console.error('Error updating event:', error);
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2025') {
      return errorResponse('Event not found', 404);
    }
    return serverErrorResponse('Failed to update event');
  }
}

export async function DELETE(request: Request) {
  try {
    const auth = await checkAuth();
    if (auth instanceof NextResponse) return auth;

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return errorResponse('Event ID required', 400);
    }

    await queuePhotosDeletionForEntities({ gallery: { eventId: id } });

    await prisma.event.delete({ where: { id } });

    return successResponse({ success: true });
  } catch (error) {
    console.error('Error deleting event:', error);
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2025') {
      return errorResponse('Event not found', 404);
    }
    return serverErrorResponse('Failed to delete event');
  }
}