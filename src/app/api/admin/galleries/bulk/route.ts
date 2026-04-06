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
    const { ids, status } = body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return errorResponse('IDs required', 400);
    }

    const updateData: Record<string, string> = {};
    if (status) updateData.status = status;

    await prisma.gallery.updateMany({
      where: { id: { in: ids } },
      data: updateData,
    });

    return successResponse({ updated: ids.length });
  } catch (error) {
    console.error('Error bulk updating galleries:', error);
    return serverErrorResponse('Failed to update galleries');
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

    await prisma.gallery.deleteMany({
      where: { id: { in: ids } },
    });

    return successResponse({ deleted: ids.length });
  } catch (error) {
    console.error('Error bulk deleting galleries:', error);
    return serverErrorResponse('Failed to delete galleries');
  }
}
