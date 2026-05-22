import { prisma } from '@/lib/db';
import { successResponse, serverErrorResponse, errorResponse } from '@/lib/api/response';
import { uploadToR2 } from '@/lib/storage/r2';
import { uploadToCloudinary, generateThumbnailUrl } from '@/lib/storage/cloudinary';
import { getCloudinaryThumbnailUrl } from '@/lib/cloudinary';
import { getDefaultAccount, updateStorageUsage, decreaseStorageUsage, findWorkingAccount } from '@/lib/storage/accounts';
import imageSize from 'image-size';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';
import { createAdminPaginationResponse } from '@/types/pagination';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { serializeBigInt } from '@/lib/bigint-utils';
import { logger } from '@/lib/logger';
import { DEFAULT_STORAGE_QUOTA_GB, BYTES_PER_GB } from '@/lib/upload/constants';

// Zod schemas
const paramsSchema = z.object({
  id: z.string().min(1, 'Gallery ID is required'),
});

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

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

    const resolvedParams = await params;
    
    // Validate route params
    const paramsValidation = paramsSchema.safeParse(resolvedParams);
    if (!paramsValidation.success) {
      const firstError = paramsValidation.error.errors[0];
      return errorResponse(`${firstError.path.join('.')}: ${firstError.message}`, 400);
    }

    const { id: galleryId } = paramsValidation.data;
    
    // Validate query params
    const { searchParams } = new URL(request.url);
    const queryValidation = querySchema.safeParse({
      page: searchParams.get('page'),
      limit: searchParams.get('limit'),
    });

    if (!queryValidation.success) {
      const firstError = queryValidation.error.errors[0];
      return errorResponse(`${firstError.path.join('.')}: ${firstError.message}`, 400);
    }

    const { page, limit } = queryValidation.data;
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

    const uniqueStorageAccountIds = Array.from(new Set(photos.map((p: typeof photos[number]) => p.storageAccountId).filter(Boolean))) as string[];
    const storageAccounts = await prisma.storageAccount.findMany({
      where: { id: { in: uniqueStorageAccountIds }, provider: 'CLOUDINARY' }
    });

    const cloudinaryAccountMap = new Map<string, typeof storageAccounts[number]>(storageAccounts.map((a: typeof storageAccounts[number]) => [a.id, a]));
    const defaultCloudinaryAccount = await getDefaultAccount('CLOUDINARY');
    const defaultCloudName = defaultCloudinaryAccount?.cloudName || process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;

    const serializedPhotos = photos.map((photo: typeof photos[number]) => {
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
        fileSize: serializeBigInt(photo.fileSize),
      };
    });

    return successResponse({
      photos: serializedPhotos,
      pagination: createAdminPaginationResponse(page, limit, total),
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

    // CRITICAL FIX C2: Atomic client quota check before upload.
    // Prevents quota bypass via the direct-upload endpoint.
    const gallery = await prisma.gallery.findUnique({
      where: { id: galleryId },
      select: {
        event: {
          select: {
            clientId: true,
            client: { select: { storageQuotaGB: true } },
          },
        },
      },
    });

    if (!gallery) {
      return errorResponse('Gallery not found', 404);
    }

    const clientId = gallery.event.clientId;
    const storageQuotaGB = gallery.event.client?.storageQuotaGB ?? DEFAULT_STORAGE_QUOTA_GB;
    const storageQuotaBytes = BigInt(Math.round(storageQuotaGB * BYTES_PER_GB));

    const quotaUpdate = await prisma.client.updateMany({
      where: {
        id: clientId,
        usedStorage: { lte: storageQuotaBytes - fileSize },
      },
      data: { 
        usedStorage: { increment: fileSize },
        photoCount: { increment: 1 },
      },
    });

    if (quotaUpdate.count === 0) {
      return errorResponse(
        `Storage quota exceeded. Limit: ${storageQuotaGB} GB`,
        413
      );
    }

    let primaryStorageAccountId: string | null = null;
    let storageUsageApplied = false;

    try {
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      let width = 0;
      let height = 0;
      try {
        const dimensions = imageSize(buffer);
        width = dimensions.width || 0;
        height = dimensions.height || 0;
      } catch (dimError) {
        logger.warn('gallery.photos.upload.dimensions_failed', { galleryId, err: dimError });
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
          logger.error('gallery.photos.upload.r2_failed', { galleryId, err: r2Error });
          lastFailedR2Id = r2Account?.id;
          r2Account = await findWorkingAccount('R2', lastFailedR2Id);
          if (!r2Account) {
            throw new Error('All R2 accounts failed');
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
          logger.error('gallery.photos.upload.cloudinary_failed', { galleryId, err: cloudinaryError });
          lastFailedCloudinaryId = cloudinaryAccount?.id;
          cloudinaryAccount = await findWorkingAccount('CLOUDINARY', lastFailedCloudinaryId);
          if (!cloudinaryAccount) {
            logger.warn('gallery.photos.upload.cloudinary_all_failed', { galleryId });
            break;
          }
        }
      }

      primaryStorageAccountId = r2Account?.id || null;

      if (primaryStorageAccountId) {
        await updateStorageUsage(primaryStorageAccountId, fileSize);
        storageUsageApplied = true;
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
        fileSize: serializeBigInt(photo.fileSize),
      };

      return successResponse({ photo: serializedPhoto }, 201);
    } catch (createError) {
      // Rollback the client quota increment
      await prisma.client.update({
        where: { id: clientId },
        data: { 
          usedStorage: { decrement: fileSize },
          photoCount: { decrement: 1 },
        },
      }).catch((rollbackErr) => {
        logger.error('gallery.photos.upload.rollback_client_failed', {
          clientId,
          fileSize: fileSize.toString(),
          err: rollbackErr,
        });
      });

      // Rollback storage account counters only if they were actually incremented
      if (storageUsageApplied && primaryStorageAccountId) {
        await decreaseStorageUsage(primaryStorageAccountId, fileSize).catch((rollbackErr) => {
          logger.error('gallery.photos.upload.rollback_storage_account_failed', {
            storageAccountId: primaryStorageAccountId,
            fileSize: fileSize.toString(),
            err: rollbackErr,
          });
        });
      }

      throw createError;
    }
  } catch (error) {
    logger.error('[API] gallery.photos.upload.unhandled_error', { err: error });
    return serverErrorResponse('Failed to upload photo');
  }
}
