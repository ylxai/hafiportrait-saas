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

export async function PATCH(request: Request) {
  try {
    const auth = await checkAuth();
    if (auth instanceof NextResponse) return auth;

    const body = await request.json();
    const { ids, toggleActive } = body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return errorResponse('IDs required', 400);
    }

    if (toggleActive) {
      const packages = await prisma.package.findMany({
        where: { id: { in: ids } },
        select: { isActive: true },
      });

      const allActive = packages.every(p => p.isActive);
      const newStatus = !allActive;

      await prisma.package.updateMany({
        where: { id: { in: ids } },
        data: { isActive: newStatus },
      });
    }

    return successResponse({ updated: ids.length });
  } catch (error) {
    console.error('Error bulk updating packages:', error);
    return serverErrorResponse('Failed to update packages');
  }
}

export async function DELETE(request: Request) {
  try {
    const auth = await checkAuth();
    if (auth instanceof NextResponse) return auth;

    const body = await request.json();
    const { ids } = body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return errorResponse('IDs required', 400);
    }

    await prisma.package.deleteMany({
      where: { id: { in: ids } },
    });

    return successResponse({ deleted: ids.length });
  } catch (error) {
    console.error('Error bulk deleting packages:', error);
    return serverErrorResponse('Failed to delete packages');
  }
}
