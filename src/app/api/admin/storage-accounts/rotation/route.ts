import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { successResponse, serverErrorResponse, errorResponse } from '@/lib/api/response';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';
import {
  getAccountsNeedingRotation,
  rotateStorageCredentials,
  setSecondaryCredentials,
  enableKeyRotation,
  disableKeyRotation,
  type RotationHistoryEntry,
} from '@/lib/storage/rotation';
import { z } from 'zod';

// Zod schemas
const getQuerySchema = z.object({
  action: z.enum(['pending-rotation']).optional(),
  accountId: z.string().optional(),
});

const postBodySchema = z.object({
  accountId: z.string().min(1, 'Account ID is required'),
  action: z.enum(['set-secondary', 'rotate-now', 'enable-rotation', 'disable-rotation']),
  schedule: z
    .object({
      frequency: z.enum(['daily', 'weekly', 'monthly', 'custom']),
      customCron: z.string().optional(),
    })
    .optional(),
  credentials: z
    .object({
      apiKey: z.string().optional(),
      apiSecret: z.string().optional(),
      accessKey: z.string().optional(),
      secretKey: z.string().optional(),
    })
    .optional(),
});

async function checkAuth() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return errorResponse('Unauthorized', 401);
  }
  return session;
}

export async function GET(request: Request) {
  try {
    const auth = await checkAuth();
    if (auth instanceof NextResponse) return auth;

    const { searchParams } = new URL(request.url);

    const validation = getQuerySchema.safeParse({
      action: searchParams.get('action') ?? undefined,
      accountId: searchParams.get('accountId') ?? undefined,
    });

    if (!validation.success) {
      const firstError = validation.error.errors[0];
      return errorResponse(`${firstError.path.join('.')}: ${firstError.message}`, 400);
    }

    const { action, accountId } = validation.data;

    // Return accounts pending auto-rotation
    if (action === 'pending-rotation') {
      const accountIds = await getAccountsNeedingRotation();
      return successResponse({ accountIds });
    }

    // Return rotation history for a specific account
    if (accountId) {
      const account = await prisma.storageAccount.findUnique({
        where: { id: accountId },
        select: {
          id: true,
          name: true,
          provider: true,
          rotationEnabled: true,
          rotationSchedule: true,
          rotationNextDate: true,
          isSecondaryActive: true,
          lastRotatedAt: true,
          rotationHistory: true,
          // Show whether secondary credentials are set (not the values)
          secondaryApiKey: true,
          secondaryApiSecret: true,
          secondaryAccessKey: true,
          secondarySecretKey: true,
        },
      });

      if (!account) {
        return errorResponse('Account not found', 404);
      }

      return successResponse({
        account: {
          id: account.id,
          name: account.name,
          provider: account.provider,
          rotationEnabled: account.rotationEnabled,
          rotationSchedule: account.rotationSchedule,
          rotationNextDate: account.rotationNextDate,
          isSecondaryActive: account.isSecondaryActive,
          lastRotatedAt: account.lastRotatedAt,
          rotationHistory: (account.rotationHistory as RotationHistoryEntry[] | null) ?? [],
          // Mask credential values — only expose whether they are set
          hasSecondaryApiKey: !!account.secondaryApiKey,
          hasSecondaryApiSecret: !!account.secondaryApiSecret,
          hasSecondaryAccessKey: !!account.secondaryAccessKey,
          hasSecondarySecretKey: !!account.secondarySecretKey,
        },
      });
    }

    // Return all accounts with rotation configured
    const accounts = await prisma.storageAccount.findMany({
      where: {
        OR: [{ rotationEnabled: true }, { isSecondaryActive: true }],
      },
      select: {
        id: true,
        name: true,
        provider: true,
        rotationEnabled: true,
        rotationSchedule: true,
        rotationNextDate: true,
        isSecondaryActive: true,
        lastRotatedAt: true,
      },
    });

    return successResponse({ accounts });
  } catch (error) {
    console.error('Error fetching rotation status:', error);
    return serverErrorResponse('Failed to fetch rotation status');
  }
}

export async function POST(request: Request) {
  try {
    const auth = await checkAuth();
    if (auth instanceof NextResponse) return auth;

    const body = await request.json();

    const validation = postBodySchema.safeParse(body);
    if (!validation.success) {
      const firstError = validation.error.errors[0];
      return errorResponse(`${firstError.path.join('.')}: ${firstError.message}`, 400);
    }

    const { accountId, action, schedule, credentials } = validation.data;

    switch (action) {
      case 'set-secondary': {
        if (!credentials) {
          return errorResponse('credentials required for set-secondary action', 400);
        }
        const result = await setSecondaryCredentials(accountId, credentials);
        if (!result.success) {
          return errorResponse(result.error ?? 'Failed to set secondary credentials', 400);
        }
        return successResponse({ success: true, message: 'Secondary credentials saved. Run "rotate-now" to activate them.' });
      }

      case 'rotate-now': {
        const result = await rotateStorageCredentials(accountId, 'manual');
        if (!result.success) {
          return errorResponse(result.error ?? 'Failed to rotate credentials', 400);
        }
        return successResponse({ success: true, message: 'Credentials rotated successfully. Secondary is now active as primary.' });
      }

      case 'enable-rotation': {
        if (!schedule) {
          return errorResponse('schedule required for enable-rotation action', 400);
        }
        if (schedule.frequency === 'custom' && !schedule.customCron) {
          return errorResponse('customCron required when frequency is "custom"', 400);
        }
        const result = await enableKeyRotation(accountId, schedule);
        if (!result.success) {
          return errorResponse(result.error ?? 'Failed to enable rotation', 400);
        }
        return successResponse({ success: true, message: `Auto-rotation enabled (${schedule.frequency})` });
      }

      case 'disable-rotation': {
        const result = await disableKeyRotation(accountId);
        if (!result.success) {
          return errorResponse(result.error ?? 'Failed to disable rotation', 400);
        }
        return successResponse({ success: true, message: 'Auto-rotation disabled' });
      }

      default:
        return errorResponse('Invalid action', 400);
    }
  } catch (error) {
    console.error('Error managing rotation:', error);
    return serverErrorResponse('Failed to manage rotation');
  }
}
