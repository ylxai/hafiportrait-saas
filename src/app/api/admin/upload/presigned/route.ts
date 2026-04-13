import { successResponse, errorResponse, serverErrorResponse } from '@/lib/api/response';
import { generatePresignedUploadUrl } from '@/lib/upload/presigned';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';
import { prisma } from '@/lib/db';
import { z } from 'zod';
import {
  MAX_FILE_SIZE_BYTES,
  MAX_FILE_SIZE_MB,
  DEFAULT_STORAGE_QUOTA_GB,
  QUOTA_WARNING_THRESHOLDS,
  PRESIGNED_URL_EXPIRY_SECONDS,
  ALLOWED_EXTENSIONS,
  ALLOWED_MIME_TYPES,
} from '@/lib/upload/constants';


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
    .refine(
      (val) => ALLOWED_MIME_TYPES.includes(val) || val.startsWith('image/'),
      'Invalid content type'
    ),
  galleryId: z.string().min(1, 'Invalid gallery ID'),
  r2AccountId: z.string().optional(),
  cloudinaryAccountId: z.string().optional(),
  fileSize: z.number()
    .int('File size must be integer')
    .positive('File size must be positive')
    .max(MAX_FILE_SIZE_BYTES, `File too large. Maximum ${MAX_FILE_SIZE_MB}MB`),
  fileHash: z.string().optional(), // Optional SHA-256 hash for integrity verification
});

type _PresignedRequest = z.infer<typeof PresignedRequestSchema>;


// Validate file type - now using Zod in the main handler
function validateFileType(filename: string, _contentType: string): { valid: boolean; error?: string } {
  const extension = '.' + filename.split('.').pop()?.toLowerCase();
  
  // Check extension
  if (!ALLOWED_EXTENSIONS.includes(extension)) {
    return {
      valid: false,
      error: `Format file tidak didukung: ${extension}. Format yang diizinkan: ${ALLOWED_EXTENSIONS.join(', ')}`,
    };
  }
  
  return { valid: true };
}

// Generate presigned URL untuk direct upload ke R2
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return errorResponse('Unauthorized', 401);
    }

    // Parse and validate request body with Zod
    const body = await request.json();
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

    // Validasi gallery exists (no ownership check - admin/manager has full access)
    const gallery = await prisma.gallery.findUnique({
      where: { id: galleryId },
      select: {
        id: true,
        event: {
          select: {
            clientId: true,
          },
        },
      },
    });

    if (!gallery) {
      return errorResponse('Gallery not found', 404);
    }

    // CRITICAL FIX: Per-client storage quota check from database
    const clientId = gallery.event.clientId;

    // Get client's storage quota (configurable per client)
    const client = await prisma.client.findUnique({
      where: { id: clientId },
      select: { storageQuotaGB: true, nama: true, email: true },
    });

    const storageQuotaGB = client?.storageQuotaGB ?? DEFAULT_STORAGE_QUOTA_GB;
    const storageQuotaBytes = BigInt(storageQuotaGB * 1024 * 1024 * 1024);

    // Calculate current usage
    const storageUsage = await prisma.photo.aggregate({
      where: {
        gallery: {
          event: {
            clientId,
          },
        },
      },
      _sum: {
        fileSize: true,
      },
    });

    const totalUsedStorage = storageUsage._sum.fileSize || BigInt(0);

    if (totalUsedStorage + BigInt(fileSize) > storageQuotaBytes) {
      const usedGB = Number(totalUsedStorage) / 1073741824;
      return errorResponse(
        `Storage quota exceeded. Used: ${usedGB.toFixed(2)}GB / ${storageQuotaGB}GB`,
        413
      );
    }

    // Quota warning checks (log + notify when approaching limits)
    const usagePercent = Number((totalUsedStorage * BigInt(100)) / storageQuotaBytes);
    const usedGB = Number(totalUsedStorage) / 1073741824;
    for (const threshold of QUOTA_WARNING_THRESHOLDS) {
      if (usagePercent >= threshold && usagePercent < threshold + 5) {
        // Only warn once per threshold (avoid spam on every upload)
        const prevThreshold = Math.floor(Number(totalUsedStorage * BigInt(100) / storageQuotaBytes) / 5) * 5;
        if (prevThreshold < threshold) {
          console.warn(`[Quota Warning] Client ${client?.nama || clientId} at ${usagePercent}% (${usedGB.toFixed(2)}GB / ${storageQuotaGB}GB)`);
          // Future: send Ably notification to admin dashboard
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
    console.error('Error generating presigned URL:', error);
    return serverErrorResponse('Failed to generate upload URL');
  }
}
