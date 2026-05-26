import { formatZodError } from '@/lib/api/validation';
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
import { withRequestContext } from '@/lib/with-request-context';
import { logger } from '@/lib/logger';
import { enforceBodySizeLimit, BODY_LIMITS } from '@/lib/api/body-size-limit';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';
import { isClientSession } from '@/lib/auth/role-helpers';
import { enforceRateLimit } from '@/lib/rate-limit-helper';
import { RATE_LIMITS } from '@/lib/rate-limit';

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
      error: `Unsupported file format: ${extension}. Allowed formats: ${ALLOWED_EXTENSIONS.join(', ')}`,
    };
  }
  return { valid: true };
}

export const POST = withRequestContext(async (request: Request) => {
  try {
    // BUG FIX: require client auth — unauthenticated callers must not be able
    // to generate R2 upload URLs for arbitrary events (payment fraud vector).
    const session = await getServerSession(authOptions);
    if (!isClientSession(session)) {
      return errorResponse('Unauthorized', 401);
    }

    // Rate limit per client to prevent upload URL abuse
    const rateLimit = await enforceRateLimit({
      identifier: `payment-presigned:${session.user.id}`,
      limit: RATE_LIMITS.ADMIN_WRITE,
    });
    if (rateLimit) return rateLimit;

    const tooLarge = enforceBodySizeLimit(request, BODY_LIMITS.JSON_SMALL);
    if (tooLarge) return tooLarge;

    const body: unknown = await request.json();
    const validation = PublicPresignedRequestSchema.safeParse(body);
    
    if (!validation.success) {
      return errorResponse(formatZodError(validation.error), 400);
    }

    const { filename, contentType, eventId } = validation.data;

    const typeValidation = validateFileType(filename);
    if (!typeValidation.valid) {
      return errorResponse(typeValidation.error || 'Invalid file type', 400);
    }

    // Check if event exists AND belongs to the authenticated client
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: {
        id: true,
        clientId: true,
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

    // BUG FIX: verify the event belongs to the authenticated client.
    // Without this check any logged-in client could upload a fake payment
    // proof for another client's event.
    if (event.clientId !== session.user.id) {
      return errorResponse('Event not found', 404);
    }

    if (event.paymentStatus === 'paid') {
      return errorResponse('Payment already settled', 400);
    }

    if (event.payments.length === 0) {
      return errorResponse('No active payment to upload for', 400);
    }

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
    logger.error('public.payment.presigned_url_failed', { err: error });
    return serverErrorResponse('Failed to generate upload URL');
  }
});
