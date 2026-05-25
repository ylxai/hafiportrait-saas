import { successResponse, errorResponse, serverErrorResponse } from '@/lib/api/response';
import { cleanupExpiredUploadSessions } from '@/lib/upload/cleanup';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';
import { requireAdminAuth } from '@/lib/auth/require-admin-auth';
import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { withRequestContext } from '@/lib/with-request-context';
import { logger } from '@/lib/logger';
import { enforceBodySizeLimit, BODY_LIMITS } from '@/lib/api/body-size-limit';
import { formatZodError } from '@/lib/api/validation';

// Zod schema for query parameters
const cleanupQuerySchema = z.object({
  dryRun: z.enum(['true', 'false']).transform(val => val === 'true').default('false'),
});

// Verify cleanup secret (for cron worker or external cron)
function verifyCleanupSecret(request: Request): boolean {
  const auth = request.headers.get('Authorization');
  const secret = process.env.CRON_SECRET || process.env.VPS_CLEANUP_SECRET;
  if (!secret || !auth) return false;

  const expected = `Bearer ${secret}`;
  if (auth.length !== expected.length) return false;

  return timingSafeEqual(
    Buffer.from(auth),
    Buffer.from(expected)
  );
}

export const POST = withRequestContext(async (request: Request) => {
  try {
    // Dual-auth: NextAuth admin session OR cleanup secret (for cron worker).
    //
    // Sourcery PR #118 feedback: the previous implementation treated ANY
    // NextResponse from requireAdminAuth() as "fall through to cron secret".
    // That collapsed the 401 (no session) and 403 (authenticated-but-not-admin)
    // branches together, so a CLIENT-role user could bypass the admin role
    // check by sending a valid cron Authorization header. Sessions and cron
    // secrets are independent credentials and must not be allowed to
    // compensate for each other.
    //
    // Resolution: probe the session first. If a session exists, enforce admin
    // role via requireAdminAuth() and surface its 403 response directly.
    // Only when there is NO session do we fall back to the cleanup-secret
    // path used by the Cloudflare cron worker / external cron.
    const session = await getServerSession(authOptions);

    if (session?.user) {
      const adminAuth = await requireAdminAuth();
      if (adminAuth instanceof NextResponse) {
        // Authenticated but not admin (403) — do NOT fall through to the
        // cron-secret path. Return the forbidden response as-is.
        return adminAuth;
      }
      // Authenticated admin session: proceed.
    } else if (!verifyCleanupSecret(request)) {
      // No session and no valid cleanup secret.
      return errorResponse('Unauthorized', 401);
    }

    const tooLarge = enforceBodySizeLimit(request, BODY_LIMITS.JSON_SMALL);
    if (tooLarge) return tooLarge;

    const { searchParams } = new URL(request.url);
    
    // Validate query parameters
    const validation = cleanupQuerySchema.safeParse({
      dryRun: searchParams.get('dryRun') ?? undefined,
    });

    if (!validation.success) {
      return errorResponse(formatZodError(validation.error), 400);
    }

    const { dryRun } = validation.data;

    // Cleanup expired upload sessions
    const deletedCount = await cleanupExpiredUploadSessions(dryRun);

    return successResponse({
      message: dryRun
        ? `Would delete ${deletedCount} expired sessions`
        : `Deleted ${deletedCount} expired upload sessions`,
      deletedCount,
      dryRun,
    });
  } catch (error) {
    logger.error('admin.upload.cleanup_failed', { err: error });
    return serverErrorResponse('Failed to cleanup upload sessions');
  }
});
