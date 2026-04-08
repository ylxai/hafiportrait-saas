import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { successResponse, serverErrorResponse, errorResponse } from '@/lib/api/response';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';

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
      usedStorage: account.usedStorage.toString(),
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
    const { name, provider, isActive, isDefault, priority, ...credentials } = body;

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
        isActive: isActive ?? true,
        isDefault: isDefault ?? false,
        priority: priority ?? 0,
        ...credentials,
      },
    });

    // Convert BigInt to string for JSON serialization
    const serializedAccount = {
      ...account,
      usedStorage: account.usedStorage.toString(),
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
    const { id, isDefault, ...data } = body;

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
      usedStorage: account.usedStorage.toString(),
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

    if (!id) {
      return errorResponse('Account ID required', 400);
    }

    await prisma.storageAccount.delete({ where: { id } });

    return successResponse({ success: true });
  } catch (error) {
    console.error('Error deleting storage account:', error);
    return serverErrorResponse('Failed to delete storage account');
  }
}