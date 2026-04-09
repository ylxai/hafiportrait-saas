import { successResponse, errorResponse, serverErrorResponse } from '@/lib/api/response';
import { generatePresignedUploadUrl } from '@/lib/upload/presigned';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';
import { prisma } from '@/lib/db';

// Allowed MIME types
const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'image/x-canon-cr2',
  'image/x-nikon-nef',
  'image/x-sony-arw',
  'image/x-adobe-dng',
  'image/x-raw',
];

// Allowed extensions
const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.heic', '.nef', '.cr2', '.arw', '.dng', '.raw'];

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

    const { filename, contentType, galleryId, r2AccountId } = await request.json();

    if (!filename || !contentType || !galleryId) {
      return errorResponse('Missing required fields', 400);
    }

    // Validasi file type
    const typeValidation = validateFileType(filename, contentType);
    if (!typeValidation.valid) {
      return errorResponse(typeValidation.error || 'Invalid file type', 400);
    }

    // Validasi gallery exists
    const gallery = await prisma.gallery.findUnique({
      where: { id: galleryId },
    });

    if (!gallery) {
      return errorResponse('Gallery not found', 404);
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

    // Generate presigned URL dengan storage account selection (valid 15 menit)
    const { presignedUrl, publicUrl, r2Key, uploadId, r2AccountId: selectedAccountId } = await generatePresignedUploadUrl(
      filename,
      contentType,
      galleryId,
      r2AccountId
    );

    return successResponse({
      presignedUrl,
      publicUrl,
      r2Key,
      uploadId,
      r2AccountId: selectedAccountId,
      expiresIn: 900, // 15 minutes
    });
  } catch (error) {
    console.error('Error generating presigned URL:', error);
    return serverErrorResponse('Failed to generate upload URL');
  }
}
