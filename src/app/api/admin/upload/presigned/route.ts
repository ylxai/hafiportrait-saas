import { successResponse, errorResponse, serverErrorResponse } from '@/lib/api/response';
import { generatePresignedUploadUrl } from '@/lib/upload/presigned';
import { NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/auth/require-admin-auth';
import { prisma } from '@/lib/db';
import { z } from 'zod';
import {
  MAX_FILE_SIZE_BYTES,
  MAX_FILE_SIZE_MB,
  DEFAULT_STORAGE_QUOTA_GB,
  QUOTA_WARNING_THRESHOLDS,
  BYTES_PER_GB,
  PRESIGNED_URL_EXPIRY_SECONDS,
  ALLOWED_EXTENSIONS,
  ALLOWED_MIME_TYPES,
  MAX_FILES_PER_BATCH,
} from '@/lib/upload/constants';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { rateLimitResponse } from '@/lib/api/response';
import { publishStorageQuotaAlert } from '@/lib/ably';
import { logger } from '@/lib/logger';
import { withRequestContext } from '@/lib/with-request-context';


// Zod validation schema for presigned upload request
const PresignedRequestSchema = z.object({
  filename: z.string()
    .min(1, 'Filename is required')
    .max(255, 'Filename too long')
    .refine(
      (val) => /^[a-zA-Z0-9._\-\s]+$/.test(val),
      'Filename contains invalid characters'
    ),
  contentType: z.string()
    // CRITICAL FIX #2: strict MIME allowlist — no `image/*` fallback (prevents image/svg+xml XSS, etc.)
    .refine(
      (val) => ALLOWED_MIME_TYPES.includes(val),
      'Invalid content type'
    ),
  galleryId: z.string().min(1, 'Invalid gallery ID'),
  r2AccountId: z.string().optional(),
  cloudinaryAccountId: z.string().optional(),
  fileSize: z.number()
    .int('File size must be integer')
    .positive('File size must be positive')
    .max(MAX_FILE_SIZE_BYTES, `File too large. Maximum ${MAX_FILE_SIZE_MB}MB`),
  // MEDIUM FIX #4: fileHash is now REQUIRED. Without it, the unique
  // `(galleryId, fileHash)` constraint cannot prevent duplicate races
  // (Postgres allows multiple NULLs in unique columns). Must be a 64-char
  // SHA-256 hex string (matches the client-side `calculateFileHash` helper).
  fileHash: z.string()
    .regex(/^[a-f0-9]{64}$/i, 'fileHash must be a 64-char SHA-256 hex string'),
});

type _PresignedRequest = z.infer<typeof PresignedRequestSchema>;


// Validate file type - now using Zod in the main handler
function validateFileType(filename: string, _contentType: string): { valid: boolean; error?: string } {
  const extension = '.' + filename.split('.').pop()?.toLowerCase();
  
  // Check extension
  if (!ALLOWED_EXTENSIONS.includes(extension)) {
    return {
      valid: false,
      error: `Unsupported file format: ${extension}. Allowed formats: ${ALLOWED_EXTENSIONS.join(', ')}`,
    };
  }
  
  return { valid: true };
}

// Generate presigned URL untuk direct upload ke R2
export const POST = withRequestContext(async (request: Request) => {
  try {
    const auth = await requireAdminAuth();
    if (auth instanceof NextResponse) return auth;

    // Rate limiting - prevent abuse of presigned URL generation
    const userId = auth.user.id || auth.user.email || 'anonymous';
    const rateLimitKey = `upload-presigned:${userId}`;
    const rateLimit = await checkRateLimit(rateLimitKey, RATE_LIMITS.UPLOAD_PRESIGNED);

    if (!rateLimit.success) {
      return rateLimitResponse(
        'Too many requests. Please try again later.',
        Math.ceil((rateLimit.resetAt - Date.now()) / 1000)
      );
    }

    // Parse and validate request body with Zod
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return errorResponse('Invalid JSON body', 400);
    }
    const validation = PresignedRequestSchema.safeParse(body);
    
    if (!validation.success) {
      const firstError = validation.error.errors[0];
      return errorResponse(`${firstError.path.join('.')}: ${firstError.message}`, 400);
    }

    const { filename, contentType, galleryId, r2AccountId, cloudinaryAccountId, fileSize, fileHash } = validation.data;

    // Validate file extension (double-check after Zod)
    const typeValidation = validateFileType(filename, contentType);
    if (!typeValidation.valid) {
      return errorResponse(typeValidation.error || 'Invalid file type', 400);
    }

    // CRITICAL FIX: Per-client storage quota check from database
    const gallery = await prisma.gallery.findUnique({
      where: { id: galleryId },
      select: {
        id: true,
        event: {
          select: {
            clientId: true,
            client: {
              select: { storageQuotaGB: true, usedStorage: true, nama: true, email: true },
            },
          },
        },
      },
    });

    if (!gallery) {
      return errorResponse('Gallery not found', 404);
    }

    // MEDIUM FIX #17: Server-side enforcement of MAX_FILES_PER_BATCH per gallery.
    // Counts active upload sessions (not yet consumed, not yet expired) for this
    // gallery and rejects further presigned URL issuance when the cap is reached.
    // This prevents a malicious or buggy client from holding hundreds of unfinished
    // sessions which would skew quota pre-checks and bloat R2 with orphan objects.
    const activeSessions = await prisma.uploadSession.count({
      where: {
        galleryId,
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
    });
    if (activeSessions >= MAX_FILES_PER_BATCH) {
      logger.warn('upload.presigned.batch_limit_reached', { galleryId, activeSessions, limit: MAX_FILES_PER_BATCH });
      return rateLimitResponse(
        `Reached limit of ${MAX_FILES_PER_BATCH} active uploads per gallery. Wait for previous uploads to finish.`,
        60
      );
    }

    const clientId = gallery.event.clientId;
    const client = gallery.event.client;
    const storageQuotaGB = client?.storageQuotaGB ?? DEFAULT_STORAGE_QUOTA_GB;
    // MEDIUM FIX #14: Use BigInt arithmetic to avoid Number overflow on large quotas
    const storageQuotaBytes = BigInt(storageQuotaGB) * BigInt(BYTES_PER_GB);

    // Read authoritative quota counter — same source of truth as the
    // atomic gate in complete/route.ts. Avoids a full-table aggregate
    // and is dedup-aware (cross-gallery dedup rolls back increments).
    const totalUsedStorage = client?.usedStorage ?? BigInt(0);

    if (totalUsedStorage + BigInt(fileSize) > storageQuotaBytes) {
      const usedGB = Number(totalUsedStorage) / BYTES_PER_GB;
      return errorResponse(
        `Storage quota exceeded. Used: ${usedGB.toFixed(2)}GB / ${storageQuotaGB}GB`,
        413
      );
    }

    // Quota warning checks - send Ably notification to admin dashboard
    const usagePercentBefore = Number((totalUsedStorage * BigInt(100)) / storageQuotaBytes);
    const usagePercentAfter = Number(((totalUsedStorage + BigInt(fileSize)) * BigInt(100)) / storageQuotaBytes);
    const usedGBAfter = Number(totalUsedStorage + BigInt(fileSize)) / BYTES_PER_GB;

    // Check if quota will be exceeded after this upload
    if (usagePercentAfter >= 100) {
      await publishStorageQuotaAlert({
        clientId,
        clientName: client?.nama || 'Unknown',
        galleryId,
        alertType: 'exceeded',
        usedGB: usedGBAfter,
        quotaGB: storageQuotaGB,
        percentage: usagePercentAfter,
      }).catch((err) => {
        logger.error('quota.alert.send_exceeded_failed', { clientId, galleryId, err });
      });
    } else {
      // Send warning/critical alerts for threshold crossings
      for (const threshold of QUOTA_WARNING_THRESHOLDS) {
        if (usagePercentBefore < threshold && usagePercentAfter >= threshold) {
          const alertType = threshold >= 95 ? 'exceeded' : threshold >= 90 ? 'critical' : 'warning';

          // Log threshold crossing
          logger.warn('quota.threshold_crossed', { clientId, clientName: client?.nama, threshold, usedGB: usedGBAfter, quotaGB: storageQuotaGB });

          // Send Ably notification to admin dashboard
          await publishStorageQuotaAlert({
            clientId,
            clientName: client?.nama || 'Unknown',
            galleryId,
            alertType,
            usedGB: usedGBAfter,
            quotaGB: storageQuotaGB,
            percentage: threshold,
          }).catch((err) => {
            logger.error('quota.alert.send_threshold_failed', { clientId, threshold, err });
          });
        }
      }
    }

    // NOTE: Race condition fix - also validate in complete route before photo creation
    // This provides a second checkpoint to prevent quota exceeded after upload

    // Validasi R2 account if provided
    if (r2AccountId) {
      const r2Account = await prisma.storageAccount.findUnique({
        where: { id: r2AccountId },
      });
      if (!r2Account || r2Account.provider !== 'R2') {
        return errorResponse('Invalid R2 storage account', 400);
      }
    }

    // Validasi Cloudinary account if provided
    if (cloudinaryAccountId) {
      const cloudinaryAccount = await prisma.storageAccount.findUnique({
        where: { id: cloudinaryAccountId },
      });
      if (!cloudinaryAccount || cloudinaryAccount.provider !== 'CLOUDINARY') {
        return errorResponse('Invalid Cloudinary storage account', 400);
      }
    }

    // Generate presigned URL dengan storage account selection (valid 15 menit)
    const { presignedUrl, publicUrl, r2Key, uploadId, r2AccountId: selectedAccountId } = await generatePresignedUploadUrl(
      filename,
      contentType,
      galleryId,
      r2AccountId,
      cloudinaryAccountId,
      fileHash // Pass hash for integrity verification
    );

    return successResponse({
      presignedUrl,
      publicUrl,
      r2Key,
      uploadId,
      r2AccountId: selectedAccountId,
      expiresIn: PRESIGNED_URL_EXPIRY_SECONDS,
    });
  } catch (error) {
    logger.error('upload.presigned.unhandled', { err: error });
    return serverErrorResponse('Failed to generate upload URL');
  }
});
