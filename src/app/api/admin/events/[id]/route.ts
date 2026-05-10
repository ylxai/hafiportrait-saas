import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { successResponse, serverErrorResponse, errorResponse, notFoundResponse } from '@/lib/api/response';
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

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await checkAuth();
    if (auth instanceof NextResponse) return auth;

    const { id } = await params;

    if (!id) {
      return errorResponse('Event ID is required', 400);
    }

    // Sum bytes per client BEFORE deletion so we can decrement
    // `Client.usedStorage` in the same transaction; the photos are about to
    // disappear via Gallery→Photo CASCADE so we can't compute the sum
    // afterwards.
    const photoSizes = await prisma.photo.findMany({
      where: { gallery: { eventId: id } },
      select: { fileSize: true, gallery: { select: { event: { select: { clientId: true } } } } },
    });
    const usedByClient = new Map<string, bigint>();
    for (const p of photoSizes) {
      const cid = p.gallery.event.clientId;
      usedByClient.set(cid, (usedByClient.get(cid) ?? BigInt(0)) + (p.fileSize ?? BigInt(0)));
    }

    const result = await queuePhotosDeletionForEntities({ gallery: { eventId: id } });

    if (!result.success) {
      console.error('[Delete] Failed to queue photos deletion:', result.error);
      return errorResponse('Failed to queue storage deletion', 500);
    }

    await prisma.$transaction([
      prisma.event.delete({ where: { id } }),
      ...Array.from(usedByClient.entries())
        .filter(([, bytes]) => bytes > BigInt(0))
        .map(([clientId, bytes]) =>
          prisma.client.update({
            where: { id: clientId },
            data: { usedStorage: { decrement: bytes } },
          }),
        ),
    ]);

    return successResponse({ success: true });
  } catch (error) {
    console.error('Error deleting event:', error);
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2025') {
      return notFoundResponse('Event not found');
    }
    return serverErrorResponse('Failed to delete event');
  }
}
