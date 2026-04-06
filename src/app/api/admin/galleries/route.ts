import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { successResponse, serverErrorResponse, errorResponse } from '@/lib/api/response';
import { gallerySchema } from '@/lib/api/validation';
import { generateClientToken } from '@/lib/utils';
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

    const galleries = await prisma.gallery.findMany({
      include: {
        event: {
          include: {
            client: true,
          },
        },
        _count: {
          select: {
            photos: true,
            selections: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ success: true, galleries }, { status: 200 });
  } catch (error) {
    console.error('Error fetching galleries:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch galleries' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const auth = await checkAuth();
    if (auth instanceof NextResponse) return auth;

    const body = await request.json();
    const validated = gallerySchema.parse(body);

    const gallery = await prisma.gallery.create({
      data: {
        ...validated,
        clientToken: generateClientToken(),
      },
    });

    return successResponse({ gallery }, 201);
  } catch (error) {
    console.error('Error creating gallery:', error);
    return serverErrorResponse('Failed to create gallery');
  }
}