import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { successResponse, serverErrorResponse, errorResponse, notFoundResponse } from '@/lib/api/response';
import { clientSchema, clientUpdateSchema, idSchema, validateRequest } from '@/lib/api/validation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';
import { queuePhotosDeletionForEntities } from '@/lib/cloudflare-queue';
import { parseAdminPaginationSafe, createAdminPaginationResponse } from '@/types/pagination';

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
    
    // Validate pagination parameters
    const paginationResult = parseAdminPaginationSafe(searchParams);
    if (!paginationResult.success) {
      const firstError = paginationResult.error.errors[0];
      return errorResponse(`${firstError.path.join('.')}: ${firstError.message}`, 400);
    }
    
    const { page, limit, skip } = paginationResult.data;

    const [clients, total] = await Promise.all([
      prisma.client.findMany({
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip,
        select: {
          id: true,
          nama: true,
          email: true,
          phone: true,
          instagram: true,
          storageQuotaGB: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.client.count(),
    ]);

    return successResponse({
      clients,
      pagination: createAdminPaginationResponse(page, limit, total),
    });
  } catch (error) {
    console.error('Error fetching clients:', error);
    return serverErrorResponse('Failed to fetch clients');
  }
}

export async function POST(request: Request) {
  try {
    const auth = await checkAuth();
    if (auth instanceof NextResponse) return auth;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return errorResponse('Invalid JSON body', 400);
    }
    const validation = clientSchema.safeParse(body);

    if (!validation.success) {
      const firstError = validation.error.errors[0];
      return errorResponse(
        firstError.path.length > 0
          ? `${firstError.path.join('.')}: ${firstError.message}`
          : firstError.message,
        400
      );
    }

    const client = await prisma.client.create({
      data: validation.data,
    });

    return successResponse({ client }, 201);
  } catch (error) {
    console.error('Error creating client:', error);
    return serverErrorResponse('Failed to create client');
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await checkAuth();
    if (auth instanceof NextResponse) return auth;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return errorResponse('Invalid JSON body', 400);
    }
    
    // Validate ID
    const idValidation = validateRequest(idSchema, body);
    if (!idValidation.success) {
      return errorResponse(idValidation.error, 400);
    }

    const { id } = idValidation.data;

    // Validate update data
    const dataValidation = validateRequest(clientUpdateSchema, body);
    if (!dataValidation.success) {
      return errorResponse(dataValidation.error, 400);
    }

    const client = await prisma.client.update({
      where: { id },
      data: dataValidation.data,
    });

    return successResponse({ client });
  } catch (error) {
    console.error('Error updating client:', error);
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2025') {
      return notFoundResponse('Client not found');
    }
    return serverErrorResponse('Failed to update client');
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

    await queuePhotosDeletionForEntities({ gallery: { event: { clientId: id } } });

    await prisma.client.delete({ where: { id } });

    return successResponse({ success: true });
  } catch (error) {
    console.error('Error deleting client:', error);
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2025') {
      return notFoundResponse('Client not found');
    }
    return serverErrorResponse('Failed to delete client');
  }
}