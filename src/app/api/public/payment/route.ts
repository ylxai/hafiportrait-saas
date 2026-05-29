import { prisma } from '@/lib/db';
import { successResponse, errorResponse, serverErrorResponse, notFoundResponse, rateLimitResponse, getClientIp } from '@/lib/api/response';
import { paymentProofSchema, formatZodError } from '@/lib/api/validation';
import { verifyR2Upload, cleanupUploadSession } from '@/lib/upload/presigned';
import { withRequestContext } from '@/lib/with-request-context';
import { logger } from '@/lib/logger';
import { enforceBodySizeLimit, BODY_LIMITS } from '@/lib/api/body-size-limit';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';

export const POST = withRequestContext(async (request: Request) => {
  try {
    const tooLarge = enforceBodySizeLimit(request, BODY_LIMITS.JSON_SMALL);
    if (tooLarge) return tooLarge;

    // Rate limit (IP-based, strict for payment submissions)
    const ip = getClientIp(request);
    const rl = await checkRateLimit(`public:payment:${ip}`, RATE_LIMITS.PUBLIC_PAYMENT_SUBMIT);
    if (!rl.success) {
      return rateLimitResponse('Too many requests', Math.ceil((rl.resetAt - Date.now()) / 1000));
    }

    const body: unknown = await request.json();
    const validation = paymentProofSchema.safeParse(body);
    if (!validation.success) {
      return errorResponse(formatZodError(validation.error), 400);
    }
    const validated = validation.data;

    // 1. Verify upload session and R2 file
    const verification = await verifyR2Upload(validated.uploadId);
    if (!verification.success) {
      return errorResponse(verification.error || 'Upload verification failed', 400);
    }

    const { publicUrl, galleryId } = verification;
    if (!publicUrl) {
      return errorResponse('Public URL not found', 400);
    }

    // 2. Verify upload belongs to this event (security check)
    const expectedGalleryId = `payments/${validated.eventId}`;
    if (galleryId !== expectedGalleryId) {
      return errorResponse('Upload does not match the payment event', 400);
    }

    // 2. Find payment and event
    const payment = await prisma.payment.findUnique({
      where: { id: validated.paymentId },
      include: { event: { include: { client: { select: { nama: true } } } } },
    });

    if (!payment) {
      return notFoundResponse('Payment data not found');
    }

    if (payment.eventId !== validated.eventId) {
      return errorResponse('Invalid data', 400);
    }

    if (payment.status === 'approved' || payment.event.paymentStatus === 'paid') {
      return errorResponse('Payment already confirmed', 400);
    }

    // 3. Update payment with proof URL and update event status
    await prisma.$transaction([
      prisma.payment.update({
        where: { id: validated.paymentId },
        data: {
          proofUrl: publicUrl,
          status: 'pending', // Re-confirming it's pending awaiting admin
        },
      }),
      prisma.event.update({
        where: { id: validated.eventId },
        data: {
          paymentStatus: 'awaiting_confirmation',
        },
      }),
    ]);

    // 4. Cleanup session
    await cleanupUploadSession(validated.uploadId);

    // 5. Notify admin via Ably (best-effort)
    try {
      const { publishPaymentProofUploaded } = await import('@/lib/ably');
      await publishPaymentProofUploaded({
        paymentId: validated.paymentId,
        eventId: validated.eventId,
        kodeBooking: payment.event.kodeBooking ?? '',
        clientName: payment.event.client?.nama ?? '',
        amount: payment.amount,
      });
    } catch {
      // non-critical, don't fail the request
    }

    return successResponse({ message: 'Transfer proof uploaded successfully' });
  } catch (error) {
    logger.error('public.payment.submit_failed', { err: error });
    return serverErrorResponse('Failed to upload transfer proof');
  }
});
