import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { successResponse, serverErrorResponse, errorResponse, notFoundResponse } from '@/lib/api/response';
import { packageSchema, packageUpdateSchema, idSchema, validateRequest } from '@/lib/api/validation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';
import { parseAdminPagination, createAdminPaginationResponse } from '@/types/pagination';

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
    const { page, limit, skip } = parseAdminPagination(searchParams);

    const [packages, total] = await Promise.all([
      prisma.package.findMany({
        orderBy: { price: 'asc' },
        take: limit,
        skip,
      }),
      prisma.package.count(),
    ]);

    return successResponse({
      packages,
      pagination: createAdminPaginationResponse(page, limit, total),
    });
  } catch (error) {
    console.error('Error fetching packages:', error);
    return serverErrorResponse('Failed to fetch packages');
  }
}

export async function POST(request: Request) {
  try {
    const auth = await checkAuth();
    if (auth instanceof NextResponse) return auth;

    const body = await request.json();
    const validated = packageSchema.parse(body);

    const pkg = await prisma.package.create({
      data: validated,
    });

    return successResponse({ package: pkg }, 201);
  } catch (error) {
    console.error('Error creating package:', error);
    return serverErrorResponse('Failed to create package');
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await checkAuth();
    if (auth instanceof NextResponse) return auth;

    const body = await request.json();
    
    // Validate ID
    const idValidation = validateRequest(idSchema, body);
    if (!idValidation.success) {
      return errorResponse(idValidation.error, 400);
    }

    const { id } = idValidation.data;
    const { id: _, ...data } = body;

    // Validate update data
    const dataValidation = validateRequest(packageUpdateSchema, data);
    if (!dataValidation.success) {
      return errorResponse(dataValidation.error, 400);
    }

    const pkg = await prisma.package.update({
      where: { id },
      data: dataValidation.data,
    });

    return successResponse({ package: pkg });
  } catch (error) {
    console.error('Error updating package:', error);
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2025') {
      return notFoundResponse('Package not found');
    }
    return serverErrorResponse('Failed to update package');
  }
}

export async function DELETE(request: Request) {
  try {
    const auth = await checkAuth();
    if (auth instanceof NextResponse) return auth;

    const { searchParams } = new URL(request.url);
    
    // Validate ID
    const idValidation = validateRequest(idSchema, { id: searchParams.get('id') });
    if (!idValidation.success) {
      return errorResponse(idValidation.error, 400);
    }

    const { id } = idValidation.data;

    await prisma.package.delete({ where: { id } });

    return successResponse({ success: true });
  } catch (error) {
    console.error('Error deleting package:', error);
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2025') {
      return notFoundResponse('Package not found');
    }
    return serverErrorResponse('Failed to delete package');
  }
}