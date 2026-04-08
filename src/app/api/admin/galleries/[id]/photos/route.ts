import { prisma } from '@/lib/db';
import { successResponse, serverErrorResponse, errorResponse } from '@/lib/api/response';
import { uploadToR2, getPublicUrl } from '@/lib/storage/r2';
import { uploadToCloudinary, generateThumbnailUrl } from '@/lib/storage/cloudinary';
import { getDefaultAccount, updateStorageUsage, findWorkingAccount } from '@/lib/storage/accounts';
import imageSize from 'image-size';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return errorResponse('Unauthorized', 401);
    }

    const { id: galleryId } = await params;
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const cloudinaryAccountId = formData.get('cloudinaryAccountId') as string | null;
    const r2AccountId = formData.get('r2AccountId') as string | null;

    if (!file) {
      return errorResponse('No file provided', 400);
    }

    // Get file size
    const fileSize = BigInt(file.size);

    // Convert file to buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Get actual image dimensions
    let width = 0;
    let height = 0;
    try {
      const dimensions = imageSize(buffer);
      width = dimensions.width || 0;
      height = dimensions.height || 0;
    } catch (dimError) {
      console.warn('Could not get image dimensions:', dimError);
    }

    // Get Cloudinary account
    let cloudinaryAccount = null;
    if (cloudinaryAccountId) {
      cloudinaryAccount = await prisma.storageAccount.findUnique({
        where: { id: cloudinaryAccountId, provider: 'CLOUDINARY', isActive: true },
      });
    }
    if (!cloudinaryAccount) {
      cloudinaryAccount = await getDefaultAccount('CLOUDINARY');
    }

    // Get R2 account
    let r2Account = null;
    if (r2AccountId) {
      r2Account = await prisma.storageAccount.findUnique({
        where: { id: r2AccountId, provider: 'R2', isActive: true },
      });
    }
    if (!r2Account) {
      r2Account = await getDefaultAccount('R2');
    }

    // Upload to R2
    let r2Key = '';
    let originalUrl = '';
    let lastFailedR2Id: string | undefined;

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const r2Creds = r2Account ? {
          accountId: r2Account.accountId || '',
          accessKey: r2Account.accessKey || '',
          secretKey: r2Account.secretKey || '',
          bucketName: r2Account.bucketName || '',
          publicUrl: r2Account.publicUrl || '',
          endpoint: r2Account.endpoint || undefined,
        } : undefined;

        const result = await uploadToR2(buffer, file.name, file.type, r2Creds);
        r2Key = result.key;
        originalUrl = result.url;
        break;
      } catch (r2Error) {
        console.error('R2 upload failed, trying next account:', r2Error);
        lastFailedR2Id = r2Account?.id;
        r2Account = await findWorkingAccount('R2', lastFailedR2Id);
        if (!r2Account) {
          return serverErrorResponse('All R2 accounts failed');
        }
      }
    }

    // Upload to Cloudinary
    let publicId = '';
    let thumbnailUrl = '';
    let lastFailedCloudinaryId: string | undefined;

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const cloudinaryCreds = cloudinaryAccount ? {
          cloudName: cloudinaryAccount.cloudName || '',
          apiKey: cloudinaryAccount.apiKey || '',
          apiSecret: cloudinaryAccount.apiSecret || '',
        } : undefined;

        const result = await uploadToCloudinary(buffer, `gallery/${galleryId}`, cloudinaryCreds);
        publicId = result.publicId;
        thumbnailUrl = generateThumbnailUrl(publicId, 400, 400);
        break;
      } catch (cloudinaryError) {
        console.error('Cloudinary upload failed, trying next account:', cloudinaryError);
        lastFailedCloudinaryId = cloudinaryAccount?.id;
        cloudinaryAccount = await findWorkingAccount('CLOUDINARY', lastFailedCloudinaryId);
        if (!cloudinaryAccount) {
          // If Cloudinary fails but R2 succeeded, continue without thumbnail
          console.error('All Cloudinary accounts failed, continuing without thumbnail');
          break;
        }
      }
    }

    // Determine which account to use for tracking
    const primaryStorageAccountId = r2Account?.id || null;

    // Update storage usage
    if (primaryStorageAccountId) {
      await updateStorageUsage(primaryStorageAccountId, fileSize);
    }

    // Create photo record
    const photo = await prisma.photo.create({
      data: {
        galleryId,
        filename: file.name,
        url: originalUrl,
        thumbnailUrl,
        publicId,
        r2Key,
        width,
        height,
        order: 0,
        fileSize,
        storageAccountId: primaryStorageAccountId,
      },
    });

    // Serialize BigInt for JSON response
    const serializedPhoto = {
      ...photo,
      fileSize: photo.fileSize?.toString() || null,
    };

    return successResponse({ photo: serializedPhoto }, 201);
  } catch (error) {
    console.error('Error uploading photo:', error);
    return serverErrorResponse('Failed to upload photo');
  }
}