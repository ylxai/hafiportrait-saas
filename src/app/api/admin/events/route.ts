import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { successResponse, serverErrorResponse, errorResponse, notFoundResponse } from '@/lib/api/response';
import { eventSchema, eventUpdateSchema, idSchema, validateRequest, formatZodError } from '@/lib/api/validation';
import { safeClientSelect } from '@/lib/api/select';
import { requireAdminAuth } from '@/lib/auth/require-admin-auth';
import { generateKodeBooking } from '@/lib/utils';
import { parseAdminPaginationSafe, createAdminPaginationResponse } from '@/types/pagination';
import { RATE_LIMITS } from '@/lib/rate-limit';
import { enforceRateLimit } from '@/lib/rate-limit-helper';
import { withRequestContext } from '@/lib/with-request-context';
import { logger } from '@/lib/logger';
import { isPrismaError } from '@/lib/prisma-error';
import { enforceBodySizeLimit, BODY_LIMITS } from '@/lib/api/body-size-limit';
import { MAX_RETRIES } from '@/lib/api/constants';

export const GET = withRequestContext(async (request: Request) => {
  try {
    const auth = await requireAdminAuth();
    if (auth instanceof NextResponse) return auth;

    // Rate limiting
    const rateLimit = await enforceRateLimit({
      identifier: `events:get:${auth.user.email}`,
      limit: RATE_LIMITS.ADMIN_READ
    });
    if (rateLimit) return rateLimit;

    const { searchParams } = new URL(request.url);
    
    // Validate pagination parameters
    const paginationResult = parseAdminPaginationSafe(searchParams);
    if (!paginationResult.success) {
      return errorResponse(formatZodError(paginationResult.error), 400);
    }
    
    const { page, limit, skip } = paginationResult.data;

    const [events, total] = await Promise.all([
      prisma.event.findMany({
        include: {
          // Strip Client.password (bcrypt hash) before serialising to admin UI.
          client: { select: safeClientSelect },
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
    logger.error('admin.events.fetch_failed', { err: error });
    return serverErrorResponse('Failed to fetch events');
  }
});

export const POST = withRequestContext(async (request: Request) => {
  try {
    const auth = await requireAdminAuth();
    if (auth instanceof NextResponse) return auth;

    // Rate limiting
    const rateLimit = await enforceRateLimit({
      identifier: `events:post:${auth.user.email}`,
      limit: RATE_LIMITS.ADMIN_WRITE
    });
    if (rateLimit) return rateLimit;

    const tooLarge = enforceBodySizeLimit(request, BODY_LIMITS.JSON_SMALL);
    if (tooLarge) return tooLarge;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return errorResponse('Invalid JSON body', 400);
    }
    const validation = eventSchema.safeParse(body);

    if (!validation.success) {
      return errorResponse(formatZodError(validation.error), 400);
    }

    const validated = validation.data;

    // Atomic creation with retry on unique constraint violation
    // This eliminates race conditions by letting the database enforce uniqueness
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
            client: { select: safeClientSelect },
            package: true,
          },
        });
        break; // Success, exit retry loop
      } catch (error) {
        // Check if it's a unique constraint violation (P2002)
        if (isPrismaError(error, 'P2002')) {
          logger.warn('admin.events.kode_booking_collision', {
            attempt: attempt + 1,
            maxRetries: MAX_RETRIES,
          });
          lastError = error;
          // Exponential backoff: 100ms, 200ms, 400ms, 800ms, 1000ms (capped)
          await new Promise(r => setTimeout(r, Math.min(100 * 2 ** attempt, 1000)));
          continue; // Retry with new kodeBooking
        }
        // For other errors, throw immediately
        throw error;
      }
    }

    if (!event) {
      logger.error('admin.events.kode_booking_exhausted', {
        maxRetries: MAX_RETRIES,
        err: lastError,
      });
      return serverErrorResponse('Failed to generate unique booking code');
    }

    return successResponse({ event }, 201);
  } catch (error) {
    logger.error('admin.events.create_failed', { err: error });
    if (isPrismaError(error, 'P2003')) {
      return notFoundResponse('Client or package not found');
    }
    return serverErrorResponse('Failed to create event');
  }
});

export const PATCH = withRequestContext(async (request: Request) => {
  try {
    const auth = await requireAdminAuth();
    if (auth instanceof NextResponse) return auth;

    // Rate limiting
    const rateLimit = await enforceRateLimit({
      identifier: `events:patch:${auth.user.email}`,
      limit: RATE_LIMITS.ADMIN_WRITE
    });
    if (rateLimit) return rateLimit;

    const tooLarge = enforceBodySizeLimit(request, BODY_LIMITS.JSON_SMALL);
    if (tooLarge) return tooLarge;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return errorResponse('Invalid JSON body', 400);
    }
    
    // Validate update data (id + fields in one pass)
    const dataValidation = validateRequest(
      eventUpdateSchema.extend({ id: idSchema.shape.id }),
      body
    );
    if (!dataValidation.success) {
      return errorResponse(dataValidation.error, 400);
    }

    const { id, ...updateData } = dataValidation.data;

    const event = await prisma.event.update({
      where: { id },
      data: updateData,
      include: { client: { select: safeClientSelect }, package: true },
    });

    return successResponse({ event });
  } catch (error) {
    logger.error('admin.events.update_failed', { err: error });
    if (isPrismaError(error, 'P2025')) {
      return notFoundResponse('Event not found');
    }
    return serverErrorResponse('Failed to update event');
  }
});
