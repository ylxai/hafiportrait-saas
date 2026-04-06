import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { successResponse, serverErrorResponse, errorResponse } from '@/lib/api/response';
import { clientSchema } from '@/lib/api/validation';
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

    const clients = await prisma.client.findMany({
      orderBy: { createdAt: 'desc' },
    });

    return successResponse({ clients });
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

    const client = await prisma.client.update({
      where: { id },
      data,
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

    await prisma.client.delete({ where: { id } });

    return successResponse({ success: true });
  } catch (error) {
    console.error('Error deleting client:', error);
    return serverErrorResponse('Failed to delete client');
  }
}