import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { successResponse, notFoundResponse, serverErrorResponse, errorResponse } from '@/lib/api/response';
import { updateGallerySchema } from '@/lib/api/validation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';

async function checkAuth() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return errorResponse('Unauthorized', 401);
  }
  return session;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await checkAuth();
    if (auth instanceof NextResponse) return auth;

    const { id } = await params;

    const gallery = await prisma.gallery.findUnique({
      where: { id },
      include: {
        event: {
          include: {
            client: true,
          },
        },
        selections: {
          orderBy: { submittedAt: 'desc' },
          include: {
            photos: {
              include: {
                photo: true
              }
            },
          },
        },
      },
    });

    if (!gallery) {
      return notFoundResponse('Gallery not found');
    }

    // Serialize BigInt fields for JSON
    const serializedGallery = {
      ...gallery,
      // photos are now fetched via a separate paginated endpoint
      photos: [],
      selections: gallery.selections.map((selection) => ({
        ...selection,
        photos: selection.photos.map((p) => ({
          ...p,
          photo: {
            ...p.photo,
            fileSize: p.photo.fileSize?.toString() || null
          }
        }))
      }))
    };

    return successResponse({ gallery: serializedGallery });
  } catch (error) {
    console.error('Error fetching gallery:', error);
    return serverErrorResponse('Failed to fetch gallery');
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await checkAuth();
    if (auth instanceof NextResponse) return auth;

    const { id } = await params;
    const body = await request.json();
    const validated = updateGallerySchema.parse(body);

    const gallery = await prisma.gallery.update({
      where: { id },
      data: validated,
    });

    return successResponse({ gallery });
  } catch (error) {
    console.error('Error updating gallery:', error);
    return serverErrorResponse('Failed to update gallery');
  }
}