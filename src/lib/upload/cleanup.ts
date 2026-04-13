// MEDIUM PRIORITY FIX #5: Cleanup expired upload sessions
import { prisma } from '@/lib/db';

export async function cleanupExpiredUploadSessions(dryRun: boolean = false): Promise<number> {
  if (dryRun) {
    // Count expired sessions without deleting
    const count = await prisma.uploadSession.count({
      where: {
        expiresAt: {
          lt: new Date(),
        },
        completedAt: null,
      },
    });
    return count;
  }

  const result = await prisma.uploadSession.deleteMany({
    where: {
      expiresAt: {
        lt: new Date(),
      },
      completedAt: null, // Only delete incomplete sessions
    },
  });
  
  return result.count;
}

// MEDIUM PRIORITY FIX: Removed setInterval - incompatible with serverless/edge environments
//
// DEPLOYED: Cloudflare Cron Trigger handles cleanup every 30 minutes
// See: workers/wrangler.toml [triggers] crons = ["*/30 * * * *"]
//
// The deletion worker (workers/deletion-worker.ts) implements the `scheduled` handler
// which calls POST /api/admin/upload/cleanup with VPS_CLEANUP_SECRET.
//
// ALTERNATIVE: Manual cleanup via admin dashboard (calls same endpoint with NextAuth session)
// Or external cron service (e.g., cron-job.org) POST to /api/admin/upload/cleanup

/**
 * @deprecated Use Cloudflare Cron Triggers or external cron service instead
 * This function only runs once on startup for backward compatibility
 */
export async function scheduleUploadSessionCleanup(): Promise<void> {
  console.warn('[Cleanup] scheduleUploadSessionCleanup() is deprecated.');
  console.warn('[Cleanup] Use Cloudflare Cron Triggers or external cron service for scheduled cleanup.');
  
  // Run once on startup for backward compatibility
  try {
    const deleted = await cleanupExpiredUploadSessions();
    if (deleted > 0) {
      console.log(`[Cleanup] Initial cleanup: deleted ${deleted} expired upload sessions`);
    }
  } catch (error) {
    console.error('[Cleanup] Initial cleanup failed:', error);
  }
}
