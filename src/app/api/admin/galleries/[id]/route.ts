import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { successResponse, notFoundResponse, serverErrorResponse, errorResponse } from '@/lib/api/response';
import { updateGallerySchema, validateRequest } from '@/lib/api/validation';
import { safeClientSelect } from '@/lib/api/select';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';
import { serializeBigInt } from '@/lib/bigint-utils';
import {
  collectDeletionDataForTransaction,
  enqueueDeletionWithOutbox,
} from '@/lib/cloudflare-queue';
import { logger } from '@/lib/logger';

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
            // Strip Client.password (bcrypt hash) from API response.
            client: { select: safeClientSelect },
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
      selections: gallery.selections.map((selection: typeof gallery.selections[number]) => ({
        ...selection,
        photos: selection.photos.map((p: typeof selection.photos[number]) => ({
          ...p,
          photo: {
            ...p.photo,
            fileSize: serializeBigInt(p.photo.fileSize)
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
    const body: unknown = await request.json();
    
    // Validate update data
    const dataValidation = validateRequest(updateGallerySchema, body);
    if (!dataValidation.success) {
      return errorResponse(dataValidation.error, 400);
    }

    const gallery = await prisma.gallery.update({
      where: { id },
      data: dataValidation.data,
    });

    return successResponse({ gallery });
  } catch (error) {
    console.error('Error updating gallery:', error);
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2025') {
      return notFoundResponse('Gallery not found');
    }
    return serverErrorResponse('Failed to update gallery');
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await checkAuth();
    if (auth instanceof NextResponse) return auth;

    const { id } = await params;

    if (!id) {
      return errorResponse('Gallery ID is required', 400);
    }

    // Step 1 — collect dedup-aware byte deltas and storage-deletion
    // payloads BEFORE the delete commits; the Photo→Gallery cascade
    // is about to remove the rows.
    // Review #96 (Gemini): use combined helper to eliminate redundant
    // database queries.
    const { usedByClient, photoCountByClient, payloads: deletionPayloads } =
      await collectDeletionDataForTransaction({ galleryId: id });

    // Step 2 — DB-first transaction.
    // Collect all unique client IDs from both maps
    const allClientIds = new Set([
      ...usedByClient.keys(),
      ...photoCountByClient.keys(),
    ]);

    await prisma.$transaction([
      prisma.gallery.delete({ where: { id } }),
      ...Array.from(allClientIds).map((clientId) => {
        const bytes = usedByClient.get(clientId) ?? BigInt(0);
        const count = photoCountByClient.get(clientId) ?? 0;
        return prisma.client.update({
          where: { id: clientId },
          data: {
            usedStorage: bytes > BigInt(0) ? { decrement: bytes } : undefined,
            photoCount: count > 0 ? { decrement: count } : undefined,
          },
        });
      }),
    ]);

    // Step 3 — best-effort enqueue; queue failure becomes a `FailedJob`
    // outbox row, not an HTTP 500.
    const outcome = await enqueueDeletionWithOutbox(deletionPayloads);
    if (outcome.outboxed > 0) {
      logger.warn('gallery.delete.storage_outboxed', {
        galleryId: id,
        photoCount: outcome.outboxed,
        outboxJobId: outcome.outboxJobId,
      });
    }

    return successResponse({ success: true });
  } catch (error) {
    console.error('Error deleting gallery:', error);
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2025') {
      return notFoundResponse('Gallery not found');
    }
    return serverErrorResponse('Failed to delete gallery');
  }
}