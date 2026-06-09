import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { successResponse, serverErrorResponse, errorResponse, notFoundResponse } from '@/lib/api/response';
import { requireAdminAuth } from '@/lib/auth/require-admin-auth';
import { withRequestContext } from '@/lib/with-request-context';
import { logger } from '@/lib/logger';
import { isPrismaError } from '@/lib/prisma-error';
import { z } from 'zod';
import { Prisma } from '@/generated/prisma';
import { formatZodError } from '@/lib/api/validation';
import { enforceBodySizeLimit, BODY_LIMITS } from '@/lib/api/body-size-limit';
import { publishPaymentStatusUpdate } from '@/lib/ably';
import { randomUUID } from 'crypto';

const patchSchema = z.object({
  action: z.enum(['approve', 'reject']),
});

export const PATCH = withRequestContext(async (
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) => {
  try {
    const auth = await requireAdminAuth();
    if (auth instanceof NextResponse) return auth;

    const { id } = await params;
    if (!id) return errorResponse('Payment ID is required', 400);

    const tooLarge = enforceBodySizeLimit(request, BODY_LIMITS.JSON_SMALL);
    if (tooLarge) return tooLarge;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return errorResponse('Invalid JSON body', 400);
    }

    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) return errorResponse(formatZodError(parsed.error), 400);

    const { action } = parsed.data;
    const newStatus = action === 'approve' ? 'approved' : 'rejected';

    const payment = await prisma.payment.findUnique({
      where: { id },
      include: {
        event: {
          select: {
            id: true,
            paymentStatus: true,
            paidAmount: true,
            totalPrice: true,
            clientId: true,
            namaProject: true,
            packageId: true,
          },
        },
      },
    });

    if (!payment) return notFoundResponse('Payment not found');
    if (payment.status === 'approved') return errorResponse('Payment already approved', 400);

    // Compute new event paymentStatus when approving
    let newEventPaymentStatus: string | undefined;

    if (action === 'approve') {
      const newPaid = (payment.event.paidAmount ?? 0) + payment.amount;
      const total = payment.event.totalPrice ?? 0;
      newEventPaymentStatus = newPaid >= total ? 'paid' : 'partial';
    } else {
      // On reject: recompute event status from remaining approved payments
      const approvedPayments = await prisma.payment.findMany({
        where: { eventId: payment.eventId, status: 'approved', id: { not: id } },
        select: { amount: true },
      });
      const approvedTotal = approvedPayments.reduce((sum: number, p: { amount: number }) => sum + p.amount, 0);
      const total = payment.event.totalPrice ?? 0;
      if (approvedTotal <= 0) {
        newEventPaymentStatus = 'unpaid';
      } else if (approvedTotal >= total) {
        newEventPaymentStatus = 'paid';
      } else {
        newEventPaymentStatus = 'partial';
      }
    }

    const [updatedPayment] = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // 1. Update payment status
      const updated = await tx.payment.update({
        where: { id },
        data: { status: newStatus },
      });

      // 2. Update event payment status + paidAmount
      if (newEventPaymentStatus) {
        await tx.event.update({
          where: { id: payment.eventId },
          data: {
            paymentStatus: newEventPaymentStatus,
            ...(action === 'approve' ? { paidAmount: { increment: payment.amount } } : {}),
          },
        });
      }

      // 3. Auto-create gallery + auto-approve client (only on first approval)
      if (action === 'approve') {
        const existing = await tx.gallery.findFirst({
          where: { eventId: payment.eventId },
          select: { id: true },
        });

        if (!existing) {
          // Fetch package defaults
          const eventPackage = payment.event.packageId
            ? await tx.package.findUnique({
                where: { id: payment.event.packageId },
                select: { maxSelection: true, maxDownload: true },
              })
            : null;

          await tx.gallery.create({
            data: {
              eventId: payment.eventId,
              namaProject: payment.event.namaProject,
              clientToken: randomUUID(),
              status: 'published',
              maxSelection: eventPackage?.maxSelection ?? 20,
              enableDownload: (eventPackage?.maxDownload ?? 0) > 0,
            },
          });

          // Auto-approve client (with null guard)
          if (payment.event.clientId) {
            await tx.client.update({
              where: { id: payment.event.clientId },
              data: { isApproved: true },
            });
          }
        }
      }

      return [updated];
    });

    // Notify via Ably (best-effort)
    await publishPaymentStatusUpdate({
      paymentId: id,
      eventId: payment.eventId,
      action,
      amount: payment.amount,
    });

    logger.info('admin.payment.status_updated', { paymentId: id, action, adminEmail: auth.user.email });

    return successResponse({ payment: updatedPayment });
  } catch (error) {
    logger.error('admin.payment.update_failed', { err: error });
    if (isPrismaError(error, 'P2025')) return notFoundResponse('Payment not found');
    return serverErrorResponse('Failed to update payment');
  }
});
