import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { successResponse, serverErrorResponse, errorResponse } from '@/lib/api/response';
import { packageSchema } from '@/lib/api/validation';
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

    const packages = await prisma.package.findMany({
      orderBy: { price: 'asc' },
    });

    return NextResponse.json({ success: true, packages }, { status: 200 });
  } catch (error) {
    console.error('Error fetching packages:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch packages' },
      { status: 500 }
    );
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
    const { id, ...data } = body;

    if (!id) {
      return errorResponse('Package ID required', 400);
    }

    const validated = packageSchema.partial().parse(data);

    const pkg = await prisma.package.update({
      where: { id },
      data: validated,
    });

    return successResponse({ package: pkg });
  } catch (error) {
    console.error('Error updating package:', error);
    return serverErrorResponse('Failed to update package');
  }
}

export async function DELETE(request: Request) {
  try {
    const auth = await checkAuth();
    if (auth instanceof NextResponse) return auth;

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return errorResponse('Package ID required', 400);
    }

    await prisma.package.delete({ where: { id } });

    return successResponse({ success: true });
  } catch (error) {
    console.error('Error deleting package:', error);
    return serverErrorResponse('Failed to delete package');
  }
}