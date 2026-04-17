import { successResponse, errorResponse, serverErrorResponse } from '@/lib/api/response';
import { cleanupExpiredUploadSessions } from '@/lib/upload/cleanup';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';
import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

// Zod schema for query parameters
const cleanupQuerySchema = z.object({
  dryRun: z.enum(['true', 'false']).transform(val => val === 'true').default('false'),
});

// Verify cleanup secret (for cron worker or external cron)
function verifyCleanupSecret(request: Request): boolean {
  const auth = request.headers.get('Authorization');
  const secret = process.env.VPS_CLEANUP_SECRET || process.env.WEBHOOK_SECRET;
  if (!secret || !auth) return false;

  const expected = `Bearer ${secret}`;
  if (auth.length !== expected.length) return false;

  return timingSafeEqual(
    Buffer.from(auth),
    Buffer.from(expected)
  );
}

export async function POST(request: Request) {
  try {
    // Check auth: either NextAuth session OR cleanup secret (for cron worker)
    let isAuthenticated = false;

    // Try NextAuth session first (admin dashboard manual cleanup)
    const session = await getServerSession(authOptions);
    if (session?.user?.role === 'admin') {
      isAuthenticated = true;
    }

    // Fall back to cleanup secret (for Cloudflare cron worker or external cron)
    if (!isAuthenticated) {
      if (!verifyCleanupSecret(request)) {
        return errorResponse('Unauthorized', 401);
      }
      isAuthenticated = true;
    }

    if (!isAuthenticated) {
      return errorResponse('Unauthorized', 401);
    }

    const { searchParams } = new URL(request.url);
    
    // Validate query parameters
    const validation = cleanupQuerySchema.safeParse({
      dryRun: searchParams.get('dryRun'),
    });

    if (!validation.success) {
      const firstError = validation.error.errors[0];
      return errorResponse(`${firstError.path.join('.')}: ${firstError.message}`, 400);
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
    console.error('Error cleaning up upload sessions:', error);
    return serverErrorResponse('Failed to cleanup upload sessions');
  }
}