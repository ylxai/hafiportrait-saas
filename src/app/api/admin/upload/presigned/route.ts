import { successResponse, errorResponse, serverErrorResponse } from '@/lib/api/response';
import { generatePresignedUploadUrl } from '@/lib/upload/presigned';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';
import { prisma } from '@/lib/db';
import {
  MAX_FILE_SIZE_BYTES,
  MAX_FILE_SIZE_MB,
  STORAGE_QUOTA_PER_CLIENT_BYTES,
  STORAGE_QUOTA_PER_CLIENT_GB,
  PRESIGNED_URL_EXPIRY_SECONDS,
  ALLOWED_EXTENSIONS,
  ALLOWED_MIME_TYPES,
} from '@/lib/upload/constants';



// Validate file type
function validateFileType(filename: string, contentType: string): { valid: boolean; error?: string } {
  const extension = '.' + filename.split('.').pop()?.toLowerCase();
  
  // Check extension
  if (!ALLOWED_EXTENSIONS.includes(extension)) {
    return {
      valid: false,
      error: `Format file tidak didukung: ${extension}. Format yang diizinkan: ${ALLOWED_EXTENSIONS.join(', ')}`,
    };
  }
  
  // Check MIME type
  if (!ALLOWED_MIME_TYPES.includes(contentType) && !contentType.startsWith('image/')) {
    return {
      valid: false,
      error: `Tipe file tidak valid: ${contentType}`,
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

    const { filename, contentType, galleryId, r2AccountId, cloudinaryAccountId, fileSize } = await request.json();

    if (!filename || !contentType || !galleryId) {
      return errorResponse('Missing required fields', 400);
    }

    // Validasi file type
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

    // CRITICAL FIX: Optimized storage quota check using aggregation (no N+1 query)
    const clientId = gallery.event.clientId;
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

    // Use BigInt for precision (avoid Number conversion precision loss)
    const totalUsedStorage = storageUsage._sum.fileSize || BigInt(0);
    const storageQuotaBytes = BigInt(STORAGE_QUOTA_PER_CLIENT_BYTES);
    
    // CRITICAL FIX: Validate fileSize before BigInt conversion
    if (fileSize === undefined || fileSize === null) {
      return errorResponse('Missing fileSize in request body', 400);
    }
    
    if (totalUsedStorage + BigInt(fileSize) > storageQuotaBytes) {
      // MEDIUM PRIORITY FIX: Use BigInt division for precision (avoid Number conversion)
      const usedGB = (totalUsedStorage / BigInt(1073741824)).toString();
      const usedGBFloat = parseFloat(usedGB) + (Number(totalUsedStorage % BigInt(1073741824)) / 1073741824);
      return errorResponse(
        `Storage quota exceeded. Used: ${usedGBFloat.toFixed(2)}GB / ${STORAGE_QUOTA_PER_CLIENT_GB}GB`,
        413
      );
    }

    // Validasi file size from request body
    if (fileSize && BigInt(fileSize) > BigInt(MAX_FILE_SIZE_BYTES)) {
      return errorResponse(`File too large. Maximum ${MAX_FILE_SIZE_MB}MB`, 413);
    }

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
      cloudinaryAccountId
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
