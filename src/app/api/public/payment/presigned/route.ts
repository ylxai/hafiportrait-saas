import { successResponse, errorResponse, serverErrorResponse } from '@/lib/api/response';
import { generatePresignedUploadUrl } from '@/lib/upload/presigned';
import { prisma } from '@/lib/db';
import { z } from 'zod';
import {
  MAX_FILE_SIZE_BYTES,
  MAX_FILE_SIZE_MB,
  PRESIGNED_URL_EXPIRY_SECONDS,
  ALLOWED_MIME_TYPES,
  ALLOWED_EXTENSIONS,
} from '@/lib/upload/constants';

// Zod validation schema for public presigned upload request
const PublicPresignedRequestSchema = z.object({
  filename: z.string()
    .min(1, 'Filename is required')
    .max(255, 'Filename too long')
    .refine(
      (val) => /^[a-zA-Z0-9._\-\s]+$/.test(val),
      'Filename contains invalid characters'
    ),
  contentType: z.string()
    .refine(
      (val) => ALLOWED_MIME_TYPES.includes(val),
      'Invalid content type'
    ),
  eventId: z.string().min(1, 'Invalid event ID'),
  fileSize: z.number()
    .int('File size must be integer')
    .positive('File size must be positive')
    .max(MAX_FILE_SIZE_BYTES, `File too large. Maximum ${MAX_FILE_SIZE_MB}MB`),
});

function validateFileType(filename: string): { valid: boolean; error?: string } {
  const extension = '.' + filename.split('.').pop()?.toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(extension)) {
    return {
      valid: false,
      error: `Format file tidak didukung: ${extension}. Format yang diizinkan: ${ALLOWED_EXTENSIONS.join(', ')}`,
    };
  }
  return { valid: true };
}

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    const validation = PublicPresignedRequestSchema.safeParse(body);
    
    if (!validation.success) {
      const firstError = validation.error.errors[0];
      return errorResponse(`${firstError.path.join('.')}: ${firstError.message}`, 400);
    }

    const { filename, contentType, eventId } = validation.data;

    const typeValidation = validateFileType(filename);
    if (!typeValidation.valid) {
      return errorResponse(typeValidation.error || 'Invalid file type', 400);
    }

    // Check if event exists
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: {
        id: true,
        paymentStatus: true,
        payments: {
          where: { status: 'pending', proofUrl: null },
          select: { id: true },
          take: 1,
        },
      },
    });

    if (!event) {
      return errorResponse('Event not found', 404);
    }

    if (event.paymentStatus === 'paid') {
      return errorResponse('Pembayaran sudah lunas', 400);
    }

    if (event.payments.length === 0) {
      return errorResponse('Tidak ada pembayaran aktif untuk diunggah', 400);
    }

    // Note: Payment proof upload uses a special dummy galleryId or eventId-based path
    // Let's use `payments/${eventId}` as a virtual galleryId for the path generation
    const virtualGalleryId = `payments/${eventId}`;

    const { presignedUrl, publicUrl, r2Key, uploadId, r2AccountId } = await generatePresignedUploadUrl(
      filename,
      contentType,
      virtualGalleryId
    );

    return successResponse({
      presignedUrl,
      publicUrl,
      r2Key,
      uploadId,
      r2AccountId,
      expiresIn: PRESIGNED_URL_EXPIRY_SECONDS,
    });
  } catch (error) {
    console.error('Error generating public presigned URL:', error);
    return serverErrorResponse('Failed to generate upload URL');
  }
}
