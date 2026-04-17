import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { successResponse, serverErrorResponse, errorResponse } from '@/lib/api/response';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';
import { serializeBigInt } from '@/lib/bigint-utils';
import { z } from 'zod';

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
  publicUrl: z.string().url().max(500).optional(),
  endpoint: z.string().url().max(500).optional(),
  // Cloudinary credentials
  cloudName: z.string().max(100).optional(),
  apiKey: z.string().max(100).optional(),
  apiSecret: z.string().max(200).optional(),
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
  publicUrl: z.string().url().max(500).optional(),
  endpoint: z.string().url().max(500).optional(),
  cloudName: z.string().max(100).optional(),
  apiKey: z.string().max(100).optional(),
  apiSecret: z.string().max(200).optional(),
  rotationEnabled: z.boolean().optional(),
  rotationSchedule: z.string().max(50).optional(),
  secondaryApiKey: z.string().max(100).optional(),
});

const deleteStorageAccountSchema = z.object({
  id: z.string().min(1, 'Account ID is required'),
});

async function checkAuth() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return errorResponse('Unauthorized', 401);
  }
  return session;
}

export async function GET() {
  try {
    const auth = await checkAuth();
    if (auth instanceof NextResponse) return auth;

    const accounts = await prisma.storageAccount.findMany({
      orderBy: [{ isDefault: 'desc' }, { priority: 'asc' }],
    });

    // Convert BigInt to string for JSON serialization
    const serializedAccounts = accounts.map(account => ({
      ...account,
      usedStorage: serializeBigInt(account.usedStorage),
    }));

    return successResponse({ accounts: serializedAccounts });
  } catch (error) {
    console.error('Error fetching storage accounts:', error);
    return serverErrorResponse('Failed to fetch storage accounts');
  }
}

export async function POST(request: Request) {
  try {
    const auth = await checkAuth();
    if (auth instanceof NextResponse) return auth;

    const body = await request.json();
    
    // Validate request body
    const validation = createStorageAccountSchema.safeParse(body);
    if (!validation.success) {
      const firstError = validation.error.errors[0];
      return errorResponse(`${firstError.path.join('.')}: ${firstError.message}`, 400);
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
    });

    // Convert BigInt to string for JSON serialization
    const serializedAccount = {
      ...account,
      usedStorage: serializeBigInt(account.usedStorage),
    };

    return successResponse({ account: serializedAccount }, 201);
  } catch (error) {
    console.error('Error creating storage account:', error);
    return serverErrorResponse('Failed to create storage account');
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await checkAuth();
    if (auth instanceof NextResponse) return auth;

    const body = await request.json();
    
    // Validate request body
    const validation = updateStorageAccountSchema.safeParse(body);
    if (!validation.success) {
      const firstError = validation.error.errors[0];
      return errorResponse(`${firstError.path.join('.')}: ${firstError.message}`, 400);
    }

    const { id, isDefault, ...data } = validation.data;

    if (isDefault) {
      const account = await prisma.storageAccount.findUnique({ where: { id } });
      if (account) {
        await prisma.storageAccount.updateMany({
          where: { provider: account.provider },
          data: { isDefault: false },
        });
      }
    }

    const account = await prisma.storageAccount.update({
      where: { id },
      data,
    });

    // Convert BigInt to string for JSON serialization
    const serializedAccount = {
      ...account,
      usedStorage: serializeBigInt(account.usedStorage),
    };

    return successResponse({ account: serializedAccount });
  } catch (error) {
    console.error('Error updating storage account:', error);
    return serverErrorResponse('Failed to update storage account');
  }
}

export async function DELETE(request: Request) {
  try {
    const auth = await checkAuth();
    if (auth instanceof NextResponse) return auth;

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    // Validate query parameter
    const validation = deleteStorageAccountSchema.safeParse({ id });
    if (!validation.success) {
      const firstError = validation.error.errors[0];
      return errorResponse(`${firstError.path.join('.')}: ${firstError.message}`, 400);
    }

    await prisma.storageAccount.delete({ where: { id: validation.data.id } });

    return successResponse({ success: true });
  } catch (error) {
    console.error('Error deleting storage account:', error);
    return serverErrorResponse('Failed to delete storage account');
  }
}