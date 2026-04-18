import { prisma } from '@/lib/db';
import { successResponse, errorResponse, notFoundResponse, serverErrorResponse } from '@/lib/api/response';
import { selectionSubmitSchema } from '@/lib/api/validation';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const body: unknown = await request.json();
    const validation = selectionSubmitSchema.safeParse(body);

    if (!validation.success) {
      const firstError = validation.error.errors[0];
      return errorResponse(
        firstError.path.length > 0
          ? `${firstError.path.join('.')}: ${firstError.message}`
          : firstError.message,
        400
      );
    }

    const { photoIds } = validation.data;

    const gallery = await prisma.gallery.findUnique({
      where: { clientToken: token },
      include: {
        selections: {
          orderBy: { submittedAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!gallery) {
      return notFoundResponse('Gallery not found');
    }

    if (gallery.selections.length > 0) {
      return errorResponse('Selection already submitted', 400);
    }

    const selection = await prisma.selection.create({
      data: {
        galleryId: gallery.id,
        photos: {
          create: photoIds.map((photoId) => ({ photoId })),
        },
      },
    });

    await prisma.gallery.update({
      where: { id: gallery.id },
      data: { isSelectionLocked: true },
    });

    return successResponse({ selectionId: selection.id }, 201);
  } catch (error) {
    console.error('Error submitting selection:', error);
    return serverErrorResponse('Failed to submit selection');
  }
}