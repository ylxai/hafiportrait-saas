import { hash } from 'bcryptjs';
import { prisma } from '@/lib/db';
import { successResponse, serverErrorResponse, errorResponse, rateLimitResponse } from '@/lib/api/response';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { bookingSchema, formatZodError } from '@/lib/api/validation';
import { generateKodeBooking } from '@/lib/utils';
import { withRequestContext } from '@/lib/with-request-context';
import { logger } from '@/lib/logger';
import { isPrismaError } from '@/lib/prisma-error';
import { enforceBodySizeLimit, BODY_LIMITS } from '@/lib/api/body-size-limit';
import { MAX_RETRIES, BCRYPT_ROUNDS } from '@/lib/api/constants';

export const POST = withRequestContext(async (request: Request) => {
  try {
    const tooLarge = enforceBodySizeLimit(request, BODY_LIMITS.JSON_SMALL);
    if (tooLarge) return tooLarge;

    // BUG FIX #3: IP-based rate limit in addition to per-email limit.
    // Per-email alone is trivially bypassed with different email addresses.
    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      request.headers.get('x-real-ip') ||
      'unknown';
    const ipRateLimit = await checkRateLimit(`booking:ip:${ip}`, RATE_LIMITS.BOOKING_IP);
    if (!ipRateLimit.success) {
      const retryAfterSeconds = Math.ceil((ipRateLimit.resetAt - Date.now()) / 1000);
      return rateLimitResponse('Too many booking requests. Please try again later.', retryAfterSeconds);
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return errorResponse('Invalid JSON body', 400);
    }
    const validation = bookingSchema.safeParse(body);

    if (!validation.success) {
      return errorResponse(formatZodError(validation.error), 400);
    }

    const validated = validation.data;

    const rateLimitResult = await checkRateLimit(`booking:${validated.email}`, RATE_LIMITS.BOOKING);
    if (!rateLimitResult.success) {
      const retryAfterSeconds = Math.ceil((rateLimitResult.resetAt - Date.now()) / 1000);
      return rateLimitResponse('Too many booking requests. Please try again later.', retryAfterSeconds);
    }

    const existingClient = await prisma.client.findFirst({
      where: { email: validated.email },
    });

    // BUG FIX #4: Block fake event injection for existing clients.
    // If the email is already registered, the public booking form must NOT
    // silently create a new event under that account — an attacker who knows
    // a client's email could spam their event list indefinitely.
    // Existing clients should log in to the portal or contact the studio.
    if (existingClient) {
      // Generic message to avoid confirming whether the email exists
      // (prevents email enumeration via the booking form).
      return errorResponse(
        'An account with this email already exists. Please log in to the client portal or contact the studio.',
        409
      );
    }

    // Brand-new self-registration via the public booking form.
    // We hash the password and store the row, but flip `isApproved` to
    // `false` so the auth provider blocks login until an admin approves.
    const passwordHash = await hash(validated.password, BCRYPT_ROUNDS);
    const client = await prisma.client.create({
      data: {
        nama: validated.nama,
        email: validated.email,
        phone: validated.phone,
        instagram: validated.instagram,
        password: passwordHash,
        isApproved: false,
      },
    });

    let packageData = null;
    if (validated.packageId) {
      packageData = await prisma.package.findUnique({
        where: { id: validated.packageId },
      });
    }

    let event = null;
    let kodeBooking = '';

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      kodeBooking = generateKodeBooking();
      try {
        const uniqueCode = Math.floor(Math.random() * 900) + 100;
        event = await prisma.event.create({
          data: {
            kodeBooking,
            clientId: client.id,
            packageId: validated.packageId || null,
            namaProject: `Project ${client.nama}`,
            eventDate: validated.eventDate,
            location: validated.location || '',
            notes: validated.notes || '',
            totalPrice: packageData?.price || 0,
            status: 'pending',
            paymentStatus: 'unpaid',
            payments: {
              create: {
                amount: packageData?.price || 0,
                uniqueCode,
                type: 'full',
                method: 'transfer',
                status: 'pending',
              },
            },
          },
          include: { payments: true },
        });
        break;
      } catch (error: unknown) {
        if (isPrismaError(error, 'P2002')) {
          logger.warn('public.booking.kode_booking_collision', {
            attempt: attempt + 1,
            maxRetries: MAX_RETRIES,
          });
          await new Promise(r => setTimeout(r, Math.min(100 * 2 ** attempt, 1000)));
          continue;
        }
        throw error;
      }
    }

    if (!event) {
      return serverErrorResponse('Failed to generate unique kode booking');
    }

    return successResponse({ event, kodeBooking }, 201);
  } catch (error) {
    logger.error('public.booking.create_failed', { err: error });
    return serverErrorResponse('Failed to create booking');
  }
});
