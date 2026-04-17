import { prisma } from '@/lib/db';
import { successResponse, errorResponse, serverErrorResponse, notFoundResponse } from '@/lib/api/response';
import { paymentProofSchema } from '@/lib/api/validation';
import { verifyR2Upload, cleanupUploadSession } from '@/lib/upload/presigned';

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    const validated = paymentProofSchema.parse(body);

    // 1. Verify upload session and R2 file
    const verification = await verifyR2Upload(validated.uploadId, 0);
    if (!verification.success) {
      return errorResponse(verification.error || 'Verifikasi upload gagal', 400);
    }

    const { publicUrl, galleryId } = verification;
    if (!publicUrl) {
      return errorResponse('Public URL tidak ditemukan', 400);
    }

    // 2. Verify upload belongs to this event (security check)
    const expectedGalleryId = `payments/${validated.eventId}`;
    if (galleryId !== expectedGalleryId) {
      return errorResponse('Upload tidak sesuai dengan event pembayaran', 400);
    }

    // 2. Find payment and event
    const payment = await prisma.payment.findUnique({
      where: { id: validated.paymentId },
      include: { event: true },
    });

    if (!payment) {
      return notFoundResponse('Data pembayaran tidak ditemukan');
    }

    if (payment.eventId !== validated.eventId) {
      return errorResponse('Data tidak valid', 400);
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

    return successResponse({ message: 'Bukti transfer berhasil diunggah' });
  } catch (error) {
    console.error('Error submitting payment proof:', error);
    return serverErrorResponse('Gagal mengunggah bukti transfer');
  }
}
