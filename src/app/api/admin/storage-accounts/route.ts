import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { successResponse, serverErrorResponse, errorResponse } from '@/lib/api/response';
import { RATE_LIMITS } from '@/lib/rate-limit';
import { enforceRateLimit } from '@/lib/rate-limit-helper';
import { requireAdminAuth } from '@/lib/auth/require-admin-auth';
import { serializeBigInt } from '@/lib/bigint-utils';
import { logger } from '@/lib/logger';
import { z } from 'zod';
import { withRequestContext } from '@/lib/with-request-context';
import { enforceBodySizeLimit, BODY_LIMITS } from '@/lib/api/body-size-limit';
import { formatZodError } from '@/lib/api/validation';

/**
 * Safe fields to return in API responses — excludes plaintext secrets.
 * secretKey (R2), apiSecret (Cloudinary), secondaryApiKey (rotation) are
 * NEVER returned to the browser. Use boolean masks (hasSecondaryKey) instead.
 */
const SAFE_ACCOUNT_SELECT = {
  id: true,
  name: true,
  provider: true,
  isActive: true,
  isDefault: true,
  priority: true,
  // R2 non-secret fields
  accountId: true,
  accessKey: true,
  bucketName: true,
  publicUrl: true,
  endpoint: true,
  // Cloudinary non-secret fields
  cloudName: true,
  apiKey: true,
  uploadPreset: true,
  // Rotation settings (no secrets)
  rotationEnabled: true,
  rotationSchedule: true,
  // Metadata
  usedStorage: true,
  storageLimitGB: true,
  createdAt: true,
  updatedAt: true,
  // secretKey: EXCLUDED (R2 secret)
  // apiSecret: EXCLUDED (Cloudinary secret)
  // secondaryApiKey: EXCLUDED (rotation secret)
} as const;

// Zod schemas for storage account operations
const createStorageAccountSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  provider: z.enum(['R2', 'CLOUDINARY'], { errorMap: () => ({ message: 'Provider must be R2 or CLOUDINARY' }) }),
  isActive: z.boolean().default(true),
  isDefault: z.boolean().default(false),
  priority: z.number().int().min(0).max(100).default(0),
  // R2 credentials
  accountId: z.string().max(100).optional(),
  accessKey: z.string().max(100).optional(),
  secretKey: z.string().max(200).optional(),
  bucketName: z.string().max(100).optional(),
  publicUrl: z.preprocess((v) => v === '' ? undefined : v, z.string().url().max(500).optional()),
  endpoint: z.preprocess((v) => v === '' ? undefined : v, z.string().url().max(500).optional()),
  // Cloudinary credentials
  cloudName: z.string().max(100).optional(),
  apiKey: z.string().max(100).optional(),
  apiSecret: z.string().max(200).optional(),
  uploadPreset: z.string().max(100).optional(),
  // Rotation settings
  rotationEnabled: z.boolean().default(false),
  rotationSchedule: z.string().max(50).optional(),
  secondaryApiKey: z.string().max(100).optional(),
}).superRefine((data, ctx) => {
  if (data.provider === 'R2') {
    const requiredR2: Array<'accountId' | 'accessKey' | 'secretKey' | 'bucketName'> = [
      'accountId',
      'accessKey',
      'secretKey',
      'bucketName',
    ];
    for (const field of requiredR2) {
      if (!data[field] || data[field]!.trim() === '') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [field],
          message: `${field} is required for R2 provider`,
        });
      }
    }
  } else if (data.provider === 'CLOUDINARY') {
    const requiredCloudinary: Array<'cloudName' | 'apiKey' | 'apiSecret'> = [
      'cloudName',
      'apiKey',
      'apiSecret',
    ];
    for (const field of requiredCloudinary) {
      if (!data[field] || data[field]!.trim() === '') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [field],
          message: `${field} is required for Cloudinary provider`,
        });
      }
    }
  }
});

const updateStorageAccountSchema = z.object({
  id: z.string().min(1, 'ID is required'),
  name: z.string().min(1).max(100).optional(),
  isActive: z.boolean().optional(),
  isDefault: z.boolean().optional(),
  priority: z.number().int().min(0).max(100).optional(),
  accountId: z.string().max(100).optional(),
  accessKey: z.string().max(100).optional(),
  secretKey: z.string().max(200).optional(),
  bucketName: z.string().max(100).optional(),
  publicUrl: z.preprocess((v) => v === '' ? undefined : v, z.string().url().max(500).optional()),
  endpoint: z.preprocess((v) => v === '' ? undefined : v, z.string().url().max(500).optional()),
  cloudName: z.string().max(100).optional(),
  apiKey: z.string().max(100).optional(),
  apiSecret: z.string().max(200).optional(),
  uploadPreset: z.string().max(100).optional(),
  rotationEnabled: z.boolean().optional(),
  rotationSchedule: z.string().max(50).optional(),
  secondaryApiKey: z.string().max(100).optional(),
});

const deleteStorageAccountSchema = z.object({
  id: z.string().min(1, 'Account ID is required'),
});

export const GET = withRequestContext(async () => {
  try {
    const auth = await requireAdminAuth();
    if (auth instanceof NextResponse) return auth;

    // Rate limiting
    const rateLimit = await enforceRateLimit({
      identifier: `storage-accounts:get:${auth.user.email}`,
      limit: RATE_LIMITS.ADMIN_READ
    });
    if (rateLimit) return rateLimit;

    const accounts = await prisma.storageAccount.findMany({
      select: SAFE_ACCOUNT_SELECT,
      orderBy: [{ isDefault: 'desc' }, { priority: 'asc' }],
    });

    // Convert BigInt to string for JSON serialization
    const serializedAccounts = accounts.map((account: (typeof accounts)[number]) => ({
      ...account,
      usedStorage: serializeBigInt(account.usedStorage),
    }));

    return successResponse({ accounts: serializedAccounts });
  } catch (error) {
    logger.error('storage_accounts.get_failed', { err: error });
    return serverErrorResponse('Failed to fetch storage accounts');
  }
});

export const POST = withRequestContext(async (request: Request) => {
  try {
    const auth = await requireAdminAuth();
    if (auth instanceof NextResponse) return auth;

    // Rate limiting
    const rateLimit = await enforceRateLimit({
      identifier: `storage-accounts:post:${auth.user.email}`,
      limit: RATE_LIMITS.ADMIN_WRITE
    });
    if (rateLimit) return rateLimit;

    const tooLarge = enforceBodySizeLimit(request, BODY_LIMITS.JSON_SMALL);
    if (tooLarge) return tooLarge;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return errorResponse('Invalid JSON body', 400);
    }
    
    // Validate request body
    const validation = createStorageAccountSchema.safeParse(body);
    if (!validation.success) {
      return errorResponse(formatZodError(validation.error), 400);
    }

    const { name, provider, isActive, isDefault, priority, ...credentials } = validation.data;

    // If setting as default, unset other defaults
    if (isDefault) {
      await prisma.storageAccount.updateMany({
        where: { provider },
        data: { isDefault: false },
      });
    }

    const account = await prisma.storageAccount.create({
      data: {
        name,
        provider,
        isActive,
        isDefault,
        priority,
        ...credentials,
      },
      select: SAFE_ACCOUNT_SELECT,
    });

    // Convert BigInt to string for JSON serialization
    const serializedAccount = {
      ...account,
      usedStorage: serializeBigInt(account.usedStorage),
    };

    return successResponse({ account: serializedAccount }, 201);
  } catch (error) {
    logger.error('storage_accounts.create_failed', { err: error });
    return serverErrorResponse('Failed to create storage account');
  }
});

export const PATCH = withRequestContext(async (request: Request) => {
  try {
    const auth = await requireAdminAuth();
    if (auth instanceof NextResponse) return auth;

    // Rate limiting
    const rateLimit = await enforceRateLimit({
      identifier: `storage-accounts:patch:${auth.user.email}`,
      limit: RATE_LIMITS.ADMIN_WRITE
    });
    if (rateLimit) return rateLimit;

    const tooLarge = enforceBodySizeLimit(request, BODY_LIMITS.JSON_SMALL);
    if (tooLarge) return tooLarge;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return errorResponse('Invalid JSON body', 400);
    }
    
    // Validate request body
    const validation = updateStorageAccountSchema.safeParse(body);
    if (!validation.success) {
      return errorResponse(formatZodError(validation.error), 400);
    }

    const { id, isDefault, ...restData } = validation.data;

    if (isDefault) {
      const account = await prisma.storageAccount.findUnique({ where: { id } });
      if (account) {
        await prisma.storageAccount.updateMany({
          where: { provider: account.provider },
          data: { isDefault: false },
        });
      }
    }

    const data = isDefault === undefined ? restData : { ...restData, isDefault };
    const account = await prisma.storageAccount.update({
      where: { id },
      data,
      select: SAFE_ACCOUNT_SELECT,
    });

    // Convert BigInt to string for JSON serialization
    const serializedAccount = {
      ...account,
      usedStorage: serializeBigInt(account.usedStorage),
    };

    return successResponse({ account: serializedAccount });
  } catch (error) {
    logger.error('storage_accounts.update_failed', { err: error });
    return serverErrorResponse('Failed to update storage account');
  }
});

export const DELETE = withRequestContext(async (request: Request) => {
  try {
    const auth = await requireAdminAuth();
    if (auth instanceof NextResponse) return auth;

    // Rate limiting
    const rateLimit = await enforceRateLimit({
      identifier: `storage-accounts:delete:${auth.user.email}`,
      limit: RATE_LIMITS.ADMIN_WRITE
    });
    if (rateLimit) return rateLimit;

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    // Validate query parameter
    const validation = deleteStorageAccountSchema.safeParse({ id });
    if (!validation.success) {
      return errorResponse(formatZodError(validation.error), 400);
    }

    await prisma.storageAccount.delete({ where: { id: validation.data.id } });

    return successResponse({ success: true });
  } catch (error) {
    logger.error('storage_accounts.delete_failed', { err: error });
    return serverErrorResponse('Failed to delete storage account');
  }
});