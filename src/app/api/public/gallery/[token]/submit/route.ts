import { prisma } from "@/lib/db";
import {
  successResponse,
  errorResponse,
  notFoundResponse,
  serverErrorResponse,
} from "@/lib/api/response";
import { selectionSubmitSchema } from "@/lib/api/validation";
import { publishSelectionUpdate } from "@/lib/ably";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/options";
import { isClientSession } from "@/lib/auth/role-helpers";
import { withRequestContext } from '@/lib/with-request-context';
import { logger } from '@/lib/logger';

export const POST = withRequestContext(async (
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) => {
  try {
    const { token } = await params;

    // Auth gate: only the owning client may submit a selection. Without
    // this, a user-reported bug let anyone with a leaked token finalize
    // selections — see issue "siapapun yang memiliki token galeri tanpa
    // login pun bisa mengada-ada selected foto".
    const session = await getServerSession(authOptions);
    if (!isClientSession(session)) {
      return errorResponse("Unauthorized", 401);
    }

    const body: unknown = await request.json();
    const validation = selectionSubmitSchema.safeParse(body);

    if (!validation.success) {
      const firstError = validation.error.errors[0];
      return errorResponse(
        firstError.path.length > 0
          ? `${firstError.path.join(".")}: ${firstError.message}`
          : firstError.message,
        400,
      );
    }

    const { photoIds } = validation.data;

    const gallery = await prisma.gallery.findUnique({
      where: { clientToken: token },
      include: {
        event: { select: { clientId: true } },
        selections: {
          orderBy: { submittedAt: "desc" },
          take: 1,
        },
      },
    });

    if (!gallery) {
      return notFoundResponse("Gallery not found");
    }

    // Refuse cross-client submissions even if the attacker somehow obtained
    // a valid client session for a different account.
    if (gallery.event.clientId !== session.user.id) {
      return notFoundResponse("Gallery not found");
    }

    if (gallery.selections.length > 0) {
      return errorResponse("Selection already submitted", 400);
    }

    const validPhotos = await prisma.photo.findMany({
      where: {
        id: { in: photoIds },
        galleryId: gallery.id,
      },
      select: { id: true },
    });

    if (validPhotos.length !== photoIds.length) {
      return errorResponse("Invalid photo IDs", 400);
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

    // Broadcast finalization on the realtime channel from the server, where
    // ABLY_API_KEY is available. Previously this was published from the
    // browser, which silently no-op'd because the REST client requires the
    // server-only env var. Fire-and-forget; we don't want subscriber failures
    // to cause the request to fail.
    void publishSelectionUpdate(gallery.id, {
      photoId: "",
      action: "finalized",
      selectionCount: photoIds.length,
      clientToken: token,
    }).catch(() => {
      // Realtime is best-effort; clients will reconcile on next fetch.
    });

    return successResponse({ selectionId: selection.id }, 201);
  } catch (error) {
    logger.error('public.gallery.selection.submit_failed', { err: error });
    return serverErrorResponse("Failed to submit selection");
  }
});
