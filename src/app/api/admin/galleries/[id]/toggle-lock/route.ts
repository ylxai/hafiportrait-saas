import { prisma } from '@/lib/db';
import { successResponse, notFoundResponse, serverErrorResponse, errorResponse } from '@/lib/api/response';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { validateRequest } from '@/lib/api/validation';

const toggleLockSchema = z.object({
  isSelectionLocked: z.boolean({
    required_error: 'Status kunci seleksi wajib diisi',
    invalid_type_error: 'Status kunci harus berupa boolean',
  }),
});

async function checkAuth() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return errorResponse('Unauthorized', 401);
  }
  return session;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await checkAuth();
    if (auth instanceof NextResponse) return auth;

    const { id } = await params;
    const body: unknown = await request.json();
    
    // Validate payload
    const validation = validateRequest(toggleLockSchema, body);
    if (!validation.success) {
      return errorResponse(validation.error, 400);
    }

    const { isSelectionLocked } = validation.data;

    const gallery = await prisma.gallery.findUnique({
      where: { id },
    });

    if (!gallery) {
      return notFoundResponse('Gallery not found');
    }

    const updatedGallery = await prisma.gallery.update({
      where: { id },
      data: { isSelectionLocked },
    });

    return successResponse({
      gallery: updatedGallery,
    });
  } catch (error) {
    console.error('Error toggling gallery lock:', error);
    return serverErrorResponse('Failed to toggle lock');
  }
}
