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

export async function GET(request: Request) {
  try {
    const auth = await checkAuth();
    if (auth instanceof NextResponse) return auth;

    const { searchParams } = new URL(request.url);
    const pageRaw = parseInt(searchParams.get('page') ?? '1', 10);
    const page = Number.isNaN(pageRaw) ? 1 : Math.max(1, pageRaw);
    const limitRaw = parseInt(searchParams.get('limit') ?? '20', 10);
    const limit = Number.isNaN(limitRaw) ? 20 : Math.min(100, Math.max(1, limitRaw));
    const skip = (page - 1) * limit;

    const [galleries, total] = await Promise.all([
      prisma.gallery.findMany({
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
        take: limit,
        skip,
      }),
      prisma.gallery.count(),
    ]);

    return successResponse({
      galleries,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Error fetching galleries:', error);
    return errorResponse('Failed to fetch galleries', 500);
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