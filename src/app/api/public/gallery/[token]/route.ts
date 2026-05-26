import {
  successResponse,
  notFoundResponse,
  serverErrorResponse,
  errorResponse,
  rateLimitResponse,
  getClientIp,
} from '@/lib/api/response';
import { z } from 'zod';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';
import { isClientSession } from '@/lib/auth/role-helpers';
import { prisma } from '@/lib/db';
import { parseCursorSafe } from '@/types/pagination';
import { loadPublicGallery } from '@/lib/gallery/load-public-gallery';
import { withRequestContext } from '@/lib/with-request-context';
import { logger } from '@/lib/logger';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';

// Validate token format (CUID)
const tokenSchema = z.string().cuid().or(z.string().min(10).max(50));

export const GET = withRequestContext(async (
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) => {
  try {
    const { token } = await params;

    // Rate limit (IP-based) — protects token enumeration
    const ip = getClientIp(request);
    const rl = await checkRateLimit(`public:gallery:${ip}`, RATE_LIMITS.PUBLIC_READ);
    if (!rl.success) {
      return rateLimitResponse('Too many requests', Math.ceil((rl.resetAt - Date.now()) / 1000));
    }

    // Validate token format
    const tokenValidation = tokenSchema.safeParse(token);
    if (!tokenValidation.success) {
      return errorResponse('Invalid gallery token format', 400);
    }

    // -------------------------------------------------------------------
    //  Auth gate (matches src/app/gallery/[token]/page.tsx).
    //
    //  Galleries are no longer reachable with a token alone. The signed-in
    //  client must own the underlying event. We respond with 404 (not 403)
    //  to avoid leaking the existence of someone else's gallery.
    // -------------------------------------------------------------------
    const session = await getServerSession(authOptions);
    if (!isClientSession(session)) {
      return errorResponse('Unauthorized', 401);
    }

    const ownerLookup = await prisma.gallery.findUnique({
      where: { clientToken: token },
      select: { event: { select: { clientId: true } } },
    });
    if (!ownerLookup) {
      return notFoundResponse('Gallery not found');
    }
    if (ownerLookup.event.clientId !== session.user.id) {
      return notFoundResponse('Gallery not found');
    }

    const { searchParams } = new URL(request.url);
    const paginationResult = parseCursorSafe(searchParams);
    if (!paginationResult.success) {
      return errorResponse(paginationResult.error.errors[0].message, 400);
    }
    const { cursor } = paginationResult.data;

    // Single shared loader keeps the REST endpoint and the Server Component
    // (`src/app/gallery/[token]/page.tsx`) byte-compatible — no risk of
    // drift when one path is updated and the other is forgotten.
    const payload = await loadPublicGallery(token, cursor ?? null);
    if (!payload) {
      return notFoundResponse('Gallery not found');
    }

    return successResponse(payload);
  } catch (error) {
    logger.error('public.gallery.fetch_failed', { err: error });
    return serverErrorResponse('Failed to fetch gallery');
  }
});