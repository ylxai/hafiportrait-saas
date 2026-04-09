import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { successResponse, serverErrorResponse, errorResponse } from '@/lib/api/response';
import { clientSchema, clientUpdateSchema } from '@/lib/api/validation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';
import { queuePhotosDeletionForEntities } from '@/lib/cloudflare-queue';

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
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20')));
    const skip = (page - 1) * limit;

    const [clients, total] = await Promise.all([
      prisma.client.findMany({
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip,
      }),
      prisma.client.count(),
    ]);

    return successResponse({
      clients,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
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

    const body = await request.json();
    const validated = clientSchema.parse(body);

    const client = await prisma.client.create({
      data: validated,
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

    const body = await request.json();
    const { id, ...data } = body;

    if (!id) {
      return errorResponse('Client ID required', 400);
    }

    // Validate update data
    const validated = clientUpdateSchema.parse(data);

    const client = await prisma.client.update({
      where: { id },
      data: validated,
    });

    return successResponse({ client });
  } catch (error) {
    console.error('Error updating client:', error);
    return serverErrorResponse('Failed to update client');
  }
}

export async function DELETE(request: Request) {
  try {
    const auth = await checkAuth();
    if (auth instanceof NextResponse) return auth;

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return errorResponse('Client ID required', 400);
    }

    await queuePhotosDeletionForEntities({ gallery: { event: { clientId: id } } });

    await prisma.client.delete({ where: { id } });

    return successResponse({ success: true });
  } catch (error) {
    console.error('Error deleting client:', error);
    return serverErrorResponse('Failed to delete client');
  }
}