import { formatZodError } from '@/lib/api/validation';
import { successResponse, errorResponse, notFoundResponse, getClientIp } from '@/lib/api/response';
import { prisma } from '@/lib/db';
import { z } from 'zod';
import { withRequestContext } from '@/lib/with-request-context';
import { logger } from '@/lib/logger';
import { enforceBodySizeLimit, BODY_LIMITS } from '@/lib/api/body-size-limit';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';
import { isClientSession } from '@/lib/auth/role-helpers';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { verifyUploadToken } from '@/lib/upload-token';

const CreatePaymentSchema = z.object({
  eventId: z.string().min(1),
  type: z.enum(['dp', 'full']),
  kodeBooking: z.string().optional(),
  uploadToken: z.string().optional(),
  uploadTokenExpiry: z.number().int().positive().optional(),
});

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

    const validation = CreatePaymentSchema.safeParse(body);
    if (!validation.success) {
      return errorResponse(formatZodError(validation.error), 400);
    }

    const { eventId, type, kodeBooking, uploadToken, uploadTokenExpiry } = validation.data;

    // Auth: session or upload token
    const session = await getServerSession(authOptions);
    let authMode: 'session' | 'token';
    let rateLimitIdentifier: string;

    if (isClientSession(session)) {
      authMode = 'session';
      rateLimitIdentifier = `payment-create:client:${session.user.id}`;
    } else {
      // Token-based auth path
      if (!kodeBooking || !uploadToken || uploadTokenExpiry === undefined) {
        return errorResponse('Unauthorized', 401);
      }

      const tokenVerification = verifyUploadToken(uploadToken, eventId, uploadTokenExpiry);
      if (!tokenVerification.valid) {
        return errorResponse('Invalid or expired upload token', 401);
      }

      authMode = 'token';
      rateLimitIdentifier = `payment-create:token:${getClientIp(request)}`;
    }

    // Rate limit
    const rateResult = await checkRateLimit(rateLimitIdentifier, RATE_LIMITS.PUBLIC_PAYMENT_SUBMIT);
    if (!rateResult.success) {
      return errorResponse('Too many requests. Please try again later.', 429);
    }

    // Find event
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: {
        id: true,
        clientId: true,
        kodeBooking: true,
        paymentStatus: true,
        totalPrice: true,
        paidAmount: true,
        payments: {
          where: { status: 'pending' },
          select: { id: true },
        },
      },
    });

    if (!event) {
      return notFoundResponse('Event not found');
    }

    // Verify ownership
    if (authMode === 'session') {
      if (event.clientId !== session!.user.id) {
        return notFoundResponse('Event not found');
      }
    } else {
      if (event.kodeBooking !== kodeBooking) {
        return errorResponse('Invalid or expired upload token', 401);
      }
    }

    // Check not already fully paid
    if (event.paymentStatus === 'paid') {
      return errorResponse('Payment already settled', 400);
    }

    // Check no existing pending payment (prevent duplicates)
    if (event.payments.length > 0) {
      return errorResponse('A pending payment already exists', 400);
    }

    // Calculate amount
    let amount: number;
    if (type === 'dp') {
      amount = Math.floor(event.totalPrice / 2);
    } else {
      amount = event.totalPrice - event.paidAmount;
    }

    // Generate unique code
    const uniqueCode = Math.floor(Math.random() * 900) + 100;

    // Create payment
    const payment = await prisma.payment.create({
      data: {
        eventId,
        amount,
        uniqueCode,
        type,
        method: 'transfer',
        status: 'pending',
      },
    });

    logger.info('public.payment.created', {
      paymentId: payment.id,
      eventId,
      type,
      amount,
      uniqueCode,
    });

    return successResponse({
      payment: {
        ...payment,
        transferAmount: payment.amount + payment.uniqueCode,
      },
    });
  } catch (error) {
    logger.error('public.payment.create_failed', { err: error });
    return errorResponse('Failed to create payment', 500);
  }
});
