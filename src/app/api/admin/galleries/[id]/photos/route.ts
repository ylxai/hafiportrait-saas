import { prisma } from '@/lib/db';
import { successResponse, serverErrorResponse, errorResponse } from '@/lib/api/response';
import { uploadToR2 } from '@/lib/storage/r2';
import { uploadToCloudinary, generateThumbnailUrl } from '@/lib/storage/cloudinary';
import { getCloudinaryThumbnailUrl } from '@/lib/cloudinary';
import { getDefaultAccount, updateStorageUsage, findWorkingAccount } from '@/lib/storage/accounts';
import imageSize from 'image-size';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';
import { NextResponse } from 'next/server';

async function checkAuth() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return errorResponse('Unauthorized', 401);
  }
  return session;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await checkAuth();
    if (auth instanceof NextResponse) return auth;

    const { id: galleryId } = await params;
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 100);
    const skip = (page - 1) * limit;

    const [photos, total] = await Promise.all([
      prisma.photo.findMany({
        where: { galleryId },
        orderBy: { order: 'asc' },
        skip,
        take: limit,
      }),
      prisma.photo.count({
        where: { galleryId },
      }),
    ]);

    const uniqueStorageAccountIds = Array.from(new Set(photos.map(p => p.storageAccountId).filter(Boolean))) as string[];
    const storageAccounts = await prisma.storageAccount.findMany({
      where: { id: { in: uniqueStorageAccountIds }, provider: 'CLOUDINARY' }
    });

    const cloudinaryAccountMap = new Map(storageAccounts.map(a => [a.id, a]));
    const defaultCloudinaryAccount = await getDefaultAccount('CLOUDINARY');
    const defaultCloudName = defaultCloudinaryAccount?.cloudName || process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;

    const serializedPhotos = photos.map(photo => {
      let thumbnailUrl = photo.thumbnailUrl;
      if (!thumbnailUrl) {
        const account = photo.storageAccountId ? cloudinaryAccountMap.get(photo.storageAccountId) : null;
        const cloudName = account?.cloudName || defaultCloudName;
        if (cloudName) {
          thumbnailUrl = getCloudinaryThumbnailUrl(photo.url, { width: 400, cloudName });
        }
      }
      return {
        ...photo,
        thumbnailUrl: thumbnailUrl || photo.url,
        fileSize: photo.fileSize?.toString() || null,
      };
    });

    return successResponse({
      photos: serializedPhotos,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Error fetching photos:', error);
    return serverErrorResponse('Failed to fetch photos');
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await checkAuth();
    if (auth instanceof NextResponse) return auth;

    const { id: galleryId } = await params;
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const cloudinaryAccountId = formData.get('cloudinaryAccountId') as string | null;
    const r2AccountId = formData.get('r2AccountId') as string | null;

    if (!file) {
      return errorResponse('No file provided', 400);
    }

    const fileSize = BigInt(file.size);
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    let width = 0;
    let height = 0;
    try {
      const dimensions = imageSize(buffer);
      width = dimensions.width || 0;
      height = dimensions.height || 0;
    } catch (dimError) {
      console.warn('Could not get image dimensions:', dimError);
    }

    let cloudinaryAccount = null;
    if (cloudinaryAccountId) {
      cloudinaryAccount = await prisma.storageAccount.findUnique({
        where: { id: cloudinaryAccountId, provider: 'CLOUDINARY', isActive: true },
      });
    }
    if (!cloudinaryAccount) {
      cloudinaryAccount = await getDefaultAccount('CLOUDINARY');
    }

    let r2Account = null;
    if (r2AccountId) {
      r2Account = await prisma.storageAccount.findUnique({
        where: { id: r2AccountId, provider: 'R2', isActive: true },
      });
    }
    if (!r2Account) {
      r2Account = await getDefaultAccount('R2');
    }

    let r2Key = '';
    let originalUrl = '';
    let lastFailedR2Id: string | undefined;

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        if (!r2Account) {
          throw new Error('No active R2 storage account configured in database');
        }

        const r2Creds = {
          accountId: r2Account.accountId || '',
          accessKey: r2Account.accessKey || '',
          secretKey: r2Account.secretKey || '',
          bucketName: r2Account.bucketName || '',
          publicUrl: r2Account.publicUrl || '',
          endpoint: r2Account.endpoint || undefined,
        };

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

    let publicId = '';
    let thumbnailUrl = '';
    let lastFailedCloudinaryId: string | undefined;

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        if (!cloudinaryAccount) {
          throw new Error('No active Cloudinary storage account configured in database');
        }

        const cloudinaryCreds = {
          cloudName: cloudinaryAccount.cloudName || '',
          apiKey: cloudinaryAccount.apiKey || '',
          apiSecret: cloudinaryAccount.apiSecret || '',
        };

        const result = await uploadToCloudinary(buffer, `gallery/${galleryId}`, cloudinaryCreds);
        publicId = result.publicId;
        thumbnailUrl = generateThumbnailUrl(publicId, 400, 400, cloudinaryCreds);
        break;
      } catch (cloudinaryError) {
        console.error('Cloudinary upload failed, trying next account:', cloudinaryError);
        lastFailedCloudinaryId = cloudinaryAccount?.id;
        cloudinaryAccount = await findWorkingAccount('CLOUDINARY', lastFailedCloudinaryId);
        if (!cloudinaryAccount) {
          console.error('All Cloudinary accounts failed, continuing without thumbnail');
          break;
        }
      }
    }

    const primaryStorageAccountId = r2Account?.id || null;

    if (primaryStorageAccountId) {
      await updateStorageUsage(primaryStorageAccountId, fileSize);
    }

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
