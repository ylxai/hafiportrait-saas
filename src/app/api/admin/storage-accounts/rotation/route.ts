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
} from '@/lib/storage/rotation';

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
    const action = searchParams.get('action');

    if (action === 'pending-rotation') {
      const accountIds = await getAccountsNeedingRotation();
      return successResponse({ accountIds });
    }

    const accounts = await prisma.storageAccount.findMany({
      where: {
        OR: [
          { rotationEnabled: true },
          { isSecondaryActive: true },
        ],
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
    const { accountId, action, schedule, credentials } = body;

    if (!accountId) {
      return errorResponse('Account ID required', 400);
    }

    switch (action) {
      case 'set-secondary': {
        if (!credentials) {
          return errorResponse('Credentials required', 400);
        }
        const result = await setSecondaryCredentials(accountId, credentials);
        if (!result.success) {
          return errorResponse(result.error || 'Failed to set secondary credentials', 400);
        }
        return successResponse({ success: true });
      }

      case 'rotate-now': {
        const result = await rotateStorageCredentials(accountId);
        if (!result.success) {
          return errorResponse(result.error || 'Failed to rotate credentials', 400);
        }
        return successResponse({ success: true });
      }

      case 'enable-rotation': {
        if (!schedule) {
          return errorResponse('Schedule required', 400);
        }
        const result = await enableKeyRotation(accountId, schedule);
        if (!result.success) {
          return errorResponse(result.error || 'Failed to enable rotation', 400);
        }
        return successResponse({ success: true });
      }

      case 'disable-rotation': {
        const result = await disableKeyRotation(accountId);
        if (!result.success) {
          return errorResponse(result.error || 'Failed to disable rotation', 400);
        }
        return successResponse({ success: true });
      }

      default:
        return errorResponse('Invalid action', 400);
    }
  } catch (error) {
    console.error('Error managing rotation:', error);
    return serverErrorResponse('Failed to manage rotation');
  }
}
