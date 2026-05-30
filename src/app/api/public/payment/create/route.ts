import { Prisma } from '@/generated/prisma';
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
          take: 1,
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

    // Fail-fast: check pre-fetched pending payments before hitting transaction
    if (event.payments.length > 0) {
      return errorResponse('A pending payment already exists', 400);
    }

    // Check not already fully paid
    if (event.paymentStatus === 'paid') {
      return errorResponse('Payment already settled', 400);
    }

    // Enforce valid state transitions server-side
    if (type === 'dp') {
      // DP only allowed when unpaid and no prior payments
      if (event.paymentStatus !== 'unpaid' || event.paidAmount > 0) {
        return errorResponse('DP payment is only allowed for new unpaid bookings', 400);
      }
    } else {
      // Full/pelunasan only allowed when unpaid or partial
      if (event.paymentStatus !== 'unpaid' && event.paymentStatus !== 'partial') {
        return errorResponse('Full payment is not allowed in current payment status', 400);
      }
    }

    // Check no existing pending payment (prevent duplicates) - atomic via transaction
    // Calculate amount
    let amount: number;
    if (type === 'dp') {
      amount = Math.floor(event.totalPrice / 2);
    } else {
      amount = event.totalPrice - event.paidAmount;
    }

    if (amount <= 0) {
      return errorResponse('Jumlah pembayaran harus lebih besar dari 0', 400);
    }

    // Generate unique code
    const uniqueCode = Math.floor(Math.random() * 900) + 100;

    // Create payment atomically to prevent race conditions
    let payment;
    try {
      payment = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        // Re-read event inside transaction for concurrency control (no business field mutation)
        const lockedEvent = await tx.event.findUnique({
          where: { id: eventId },
          select: { id: true, paymentStatus: true, paidAmount: true },
        });
        if (!lockedEvent) {
          throw new Error('EVENT_NOT_FOUND');
        }

        // Re-validate state transitions with fresh data inside transaction
        if (lockedEvent.paymentStatus === 'paid') {
          throw new Error('ALREADY_PAID');
        }
        if (type === 'dp' && (lockedEvent.paymentStatus !== 'unpaid' || lockedEvent.paidAmount > 0)) {
          throw new Error('INVALID_STATE_DP');
        }
        if (type === 'full' && lockedEvent.paymentStatus !== 'unpaid' && lockedEvent.paymentStatus !== 'partial') {
          throw new Error('INVALID_STATE_FULL');
        }

        const existing = await tx.payment.findFirst({
          where: { eventId, status: 'pending' },
        });
        if (existing) {
          throw new Error('DUPLICATE_PENDING');
        }
        return tx.payment.create({
          data: {
            eventId,
            amount,
            uniqueCode,
            type,
            method: 'transfer',
            status: 'pending',
          },
        });
      });
    } catch (txError) {
      if (txError instanceof Error && txError.message === 'DUPLICATE_PENDING') {
        return errorResponse('A pending payment already exists', 400);
      }
      if (txError instanceof Error && txError.message === 'EVENT_NOT_FOUND') {
        return notFoundResponse('Event not found');
      }
      if (txError instanceof Error && txError.message === 'ALREADY_PAID') {
        return errorResponse('Payment already settled', 400);
      }
      if (txError instanceof Error && txError.message === 'INVALID_STATE_DP') {
        return errorResponse('DP payment is only allowed for new unpaid bookings', 400);
      }
      if (txError instanceof Error && txError.message === 'INVALID_STATE_FULL') {
        return errorResponse('Full payment is not allowed in current payment status', 400);
      }
      throw txError;
    }

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
