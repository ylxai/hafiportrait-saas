import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { successResponse, serverErrorResponse, errorResponse } from '@/lib/api/response';
import { gallerySchema } from '@/lib/api/validation';
import { generateClientToken } from '@/lib/utils';
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
      pagination: createAdminPaginationResponse(page, limit, total),
    });
  } catch (error) {
    console.error('Error fetching galleries:', error);
    return serverErrorResponse('Failed to fetch galleries');
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