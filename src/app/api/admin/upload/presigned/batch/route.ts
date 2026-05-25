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
  BYTES_PER_GB,
  PRESIGNED_URL_EXPIRY_SECONDS,
  ALLOWED_EXTENSIONS,
  ALLOWED_MIME_TYPES,
  MAX_FILES_PER_BATCH,
} from '@/lib/upload/constants';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { rateLimitResponse } from '@/lib/api/response';
import { logger } from '@/lib/logger';
import { withRequestContext } from '@/lib/with-request-context';
import { enforceBodySizeLimit, BODY_LIMITS } from '@/lib/api/body-size-limit';

const MAX_BATCH_SIZE = 50;

const BatchFileSchema = z.object({
  filename: z.string()
    .min(1)
    .max(255)
    .refine((val) => /^[a-zA-Z0-9._\-\s]+$/.test(val), 'Filename contains invalid characters'),
  contentType: z.string()
    .refine((val) => ALLOWED_MIME_TYPES.includes(val), 'Invalid content type'),
  fileSize: z.number()
    .int()
    .positive()
    .max(MAX_FILE_SIZE_BYTES, `File too large. Maximum ${MAX_FILE_SIZE_MB}MB`),
  fileHash: z.string()
    .regex(/^[a-f0-9]{64}$/i, 'fileHash must be a 64-char SHA-256 hex string'),
});

const BatchPresignedSchema = z.object({
  galleryId: z.string().min(1, 'Invalid gallery ID'),
  r2AccountId: z.string().optional(),
  cloudinaryAccountId: z.string().optional(),
  files: z.array(BatchFileSchema).min(1).max(MAX_BATCH_SIZE, `Maximum ${MAX_BATCH_SIZE} files per batch`),
});

function validateFileExtension(filename: string): boolean {
  const extension = '.' + filename.split('.').pop()?.toLowerCase();
  return ALLOWED_EXTENSIONS.includes(extension);
}

export const POST = withRequestContext(async (request: Request) => {
  try {
    const auth = await requireAdminAuth();
    if (auth instanceof NextResponse) return auth;

    const userId = auth.user.id || auth.user.email || 'anonymous';
    const rateLimit = await checkRateLimit(`upload-presigned-batch:${userId}`, RATE_LIMITS.UPLOAD_PRESIGNED);
    if (!rateLimit.success) {
      return rateLimitResponse(
        'Too many requests. Please try again later.',
        Math.ceil((rateLimit.resetAt - Date.now()) / 1000)
      );
    }

    const tooLarge = enforceBodySizeLimit(request, BODY_LIMITS.JSON_BATCH);
    if (tooLarge) return tooLarge;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return errorResponse('Invalid JSON body', 400);
    }

    const validation = BatchPresignedSchema.safeParse(body);
    if (!validation.success) {
      const firstError = validation.error.errors[0];
      return errorResponse(`${firstError.path.join('.')}: ${firstError.message}`, 400);
    }

    const { galleryId, r2AccountId, cloudinaryAccountId, files } = validation.data;

    // Validate all file extensions
    for (const file of files) {
      if (!validateFileExtension(file.filename)) {
        return errorResponse(`Unsupported file format: ${file.filename}`, 400);
      }
    }

    // Get gallery and client info for quota check
    const gallery = await prisma.gallery.findUnique({
      where: { id: galleryId },
      select: {
        id: true,
        event: {
          select: {
            clientId: true,
            client: { select: { storageQuotaGB: true, nama: true } },
          },
        },
      },
    });

    if (!gallery) {
      return errorResponse('Gallery not found', 404);
    }

    const clientId = gallery.event.clientId;
    const storageQuotaGB = gallery.event.client?.storageQuotaGB ?? DEFAULT_STORAGE_QUOTA_GB;
    const storageQuotaBytes = BigInt(storageQuotaGB) * BigInt(BYTES_PER_GB);

    // Check active sessions cap
    const activeSessions = await prisma.uploadSession.count({
      where: { galleryId, consumedAt: null, expiresAt: { gt: new Date() } },
    });
    const totalAfterBatch = activeSessions + files.length;
    if (totalAfterBatch > MAX_FILES_PER_BATCH) {
      return rateLimitResponse(
        `Active upload limit reached. Remaining slots: ${Math.max(0, MAX_FILES_PER_BATCH - activeSessions)}.`,
        60
      );
    }

    // Aggregate quota check for entire batch
    const totalBatchSize = files.reduce((sum, f) => sum + f.fileSize, 0);
    const storageUsage = await prisma.photo.aggregate({
      where: { gallery: { event: { clientId } } },
      _sum: { fileSize: true },
    });
    const totalUsedStorage = storageUsage._sum.fileSize || BigInt(0);

    if (totalUsedStorage + BigInt(totalBatchSize) > storageQuotaBytes) {
      const usedGB = Number(totalUsedStorage) / BYTES_PER_GB;
      return errorResponse(
        `Storage quota exceeded. Used: ${usedGB.toFixed(2)}GB / ${storageQuotaGB}GB. Batch requires ${(totalBatchSize / BYTES_PER_GB).toFixed(2)}GB.`,
        413
      );
    }

    // Validate storage accounts once
    if (r2AccountId) {
      const r2Account = await prisma.storageAccount.findUnique({ where: { id: r2AccountId } });
      if (!r2Account || r2Account.provider !== 'R2') {
        return errorResponse('Invalid R2 storage account', 400);
      }
    }
    if (cloudinaryAccountId) {
      const cloudinaryAccount = await prisma.storageAccount.findUnique({ where: { id: cloudinaryAccountId } });
      if (!cloudinaryAccount || cloudinaryAccount.provider !== 'CLOUDINARY') {
        return errorResponse('Invalid Cloudinary storage account', 400);
      }
    }

    // Generate presigned URLs for all files
    const results = await Promise.all(
      files.map(async (file) => {
        try {
          const { presignedUrl, publicUrl, r2Key, uploadId, r2AccountId: selectedAccountId } =
            await generatePresignedUploadUrl(
              file.filename,
              file.contentType,
              galleryId,
              r2AccountId,
              cloudinaryAccountId,
              file.fileHash
            );

          return {
            filename: file.filename,
            presignedUrl,
            publicUrl,
            r2Key,
            uploadId,
            r2AccountId: selectedAccountId,
            expiresIn: PRESIGNED_URL_EXPIRY_SECONDS,
            error: null,
          };
        } catch (err) {
          logger.error('batch-presigned.file_failed', { filename: file.filename, err });
          return {
            filename: file.filename,
            presignedUrl: null,
            publicUrl: null,
            r2Key: null,
            uploadId: null,
            r2AccountId: null,
            expiresIn: null,
            error: err instanceof Error ? err.message : 'Failed to generate URL',
          };
        }
      })
    );

    const succeeded = results.filter(r => r.error === null);
    const failed = results.filter(r => r.error !== null);

    return successResponse({
      urls: succeeded,
      failed,
      total: files.length,
      succeeded: succeeded.length,
      failed_count: failed.length,
    });
  } catch (error) {
    logger.error('batch-presigned.unhandled', { err: error });
    return serverErrorResponse('Failed to generate batch upload URLs');
  }
});
