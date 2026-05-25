import { hash } from 'bcryptjs';
import { prisma } from '@/lib/db';
import { successResponse, serverErrorResponse, errorResponse, rateLimitResponse } from '@/lib/api/response';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { bookingSchema } from '@/lib/api/validation';
import { generateKodeBooking } from '@/lib/utils';
import { withRequestContext } from '@/lib/with-request-context';
import { logger } from '@/lib/logger';
import { isPrismaError } from '@/lib/prisma-error';
import { enforceBodySizeLimit, BODY_LIMITS } from '@/lib/api/body-size-limit';
import { MAX_RETRIES, BCRYPT_ROUNDS } from '@/lib/api/constants';

// Match the cost factor used in `src/app/api/admin/clients/route.ts` and the
// auth provider's dummy hash so the bcrypt compare path takes ~the same
// time regardless of whether the row was created by admin or via booking.
// (See BCRYPT_ROUNDS in @/lib/api/constants.)

export const POST = withRequestContext(async (request: Request) => {
  try {
    const tooLarge = enforceBodySizeLimit(request, BODY_LIMITS.JSON_SMALL);
    if (tooLarge) return tooLarge;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return errorResponse('Invalid JSON body', 400);
    }
    const validation = bookingSchema.safeParse(body);

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

    const rateLimitResult = await checkRateLimit(`booking:${validated.email}`, RATE_LIMITS.BOOKING);
    if (!rateLimitResult.success) {
      const retryAfterSeconds = Math.ceil((rateLimitResult.resetAt - Date.now()) / 1000);
      return rateLimitResponse('Too many booking requests. Please try again later.', retryAfterSeconds);
    }

    let client = await prisma.client.findFirst({
      where: { email: validated.email },
    });

    if (!client) {
      // Brand-new self-registration via the public booking form.
      //
      // We hash the password and store the row, but flip `isApproved` to
      // `false` so the auth provider in `src/lib/auth/options.ts` blocks
      // login until an admin reviews the booking and approves the row
      // from the dashboard. This protects against:
      //   1. Spam/bot-created accounts logging into the portal before
      //      anyone vets them.
      //   2. A booking taking effect against a real existing client whose
      //      email was guessed by an attacker (we never overwrite an
      //      existing row's password — see the `else` branch below).
      const passwordHash = await hash(validated.password, BCRYPT_ROUNDS);
      client = await prisma.client.create({
        data: {
          nama: validated.nama,
          email: validated.email,
          phone: validated.phone,
          instagram: validated.instagram,
          password: passwordHash,
          isApproved: false,
        },
      });
    }
    // If the client already exists we deliberately ignore the supplied
    // password and re-use the existing row. This prevents a booking-form
    // submission from silently rotating the password of an established
    // client — admins can rotate passwords explicitly from the dashboard.

    let packageData = null;
    if (validated.packageId) {
      packageData = await prisma.package.findUnique({
        where: { id: validated.packageId },
      });
    }

    // Retry pattern for unique kode booking
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
                type: 'full', // Default to full, can be changed if UI supports DP selection
                method: 'transfer',
                status: 'pending'
              }
            }
          },
          include: {
            payments: true
          }
        });
        break;
      } catch (error: unknown) {
        if (isPrismaError(error, 'P2002')) {
          logger.warn('public.booking.kode_booking_collision', {
            attempt: attempt + 1,
            maxRetries: MAX_RETRIES,
          });
          // Exponential backoff: 100ms, 200ms, 400ms, 800ms, 1000ms (capped)
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