import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { successResponse, serverErrorResponse, errorResponse, notFoundResponse } from '@/lib/api/response';
import { eventSchema, eventUpdateSchema, idSchema, validateRequest } from '@/lib/api/validation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';
import { generateKodeBooking } from '@/lib/utils';
import { parseAdminPaginationSafe, createAdminPaginationResponse } from '@/types/pagination';

async function checkAuth() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return errorResponse('Unauthorized', 401);
  }
  return session;
}

export async function GET(request: Request) {
  try {
    const auth = await checkAuth();
    if (auth instanceof NextResponse) return auth;

    const { searchParams } = new URL(request.url);
    
    // Validate pagination parameters
    const paginationResult = parseAdminPaginationSafe(searchParams);
    if (!paginationResult.success) {
      const firstError = paginationResult.error.errors[0];
      return errorResponse(`${firstError.path.join('.')}: ${firstError.message}`, 400);
    }
    
    const { page, limit, skip } = paginationResult.data;

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
      pagination: createAdminPaginationResponse(page, limit, total),
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

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return errorResponse('Invalid JSON body', 400);
    }
    const validation = eventSchema.safeParse(body);

    if (!validation.success) {
      const firstError = validation.error.errors[0];
      return errorResponse(
        firstError.path.length > 0
          ? `${firstError.path.join('.')}: ${firstError.message}`
          : firstError.message,
        400
      );
    }

    const validated = validation.data;

    // Atomic creation with retry on unique constraint violation
    // This eliminates race conditions by letting the database enforce uniqueness
    const MAX_RETRIES = 5;
    let event = null;
    let lastError = null;
    
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const kodeBooking = generateKodeBooking();
      
      try {
        event = await prisma.event.create({
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
        break; // Success, exit retry loop
      } catch (error) {
        // Check if it's a unique constraint violation (P2002)
        if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') {
          console.warn(`Kode booking collision (attempt ${attempt + 1}/${MAX_RETRIES}), retrying...`);
          lastError = error;
          continue; // Retry with new kodeBooking
        }
        // For other errors, throw immediately
        throw error;
      }
    }

    if (!event) {
      console.error('Failed to generate unique kode booking after', MAX_RETRIES, 'attempts. Last error:', lastError);
      return serverErrorResponse('Failed to generate unique booking code');
    }

    return successResponse({ event }, 201);
  } catch (error) {
    console.error('Error creating event:', error);
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2003') {
      return notFoundResponse('Client or package not found');
    }
    return serverErrorResponse('Failed to create event');
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await checkAuth();
    if (auth instanceof NextResponse) return auth;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return errorResponse('Invalid JSON body', 400);
    }
    
    // Validate ID
    const idValidation = validateRequest(idSchema, body);
    if (!idValidation.success) {
      return errorResponse(idValidation.error, 400);
    }

    const { id } = idValidation.data;

    // Validate update data
    // @ts-expect-error - eventUpdateSchema has transforms, type inference is complex
    const dataValidation = validateRequest(eventUpdateSchema, body);
    if (!dataValidation.success) {
      return errorResponse(dataValidation.error, 400);
    }

    const event = await prisma.event.update({
      where: { id },
      data: dataValidation.data,
      include: { client: true, package: true },
    });

    return successResponse({ event });
  } catch (error) {
    console.error('Error updating event:', error);
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2025') {
      return notFoundResponse('Event not found');
    }
    return serverErrorResponse('Failed to update event');
  }
}
