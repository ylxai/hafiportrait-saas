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
// RECOMMENDED: Use Cloudflare Cron Triggers for production
// See: https://developers.cloudflare.com/workers/configuration/cron-triggers/
//
// Example wrangler.toml configuration:
// [triggers]
// crons = ["*/30 * * * *"]  # Every 30 minutes
//
// Then in your Cloudflare Worker:
// export default {
//   async scheduled(event, env, ctx) {
//     await cleanupExpiredUploadSessions();
//   }
// }
//
// ALTERNATIVE: For non-Edge deployments, create API endpoint:
// GET /api/admin/cleanup/upload-sessions (protected with auth)
// Then use external cron service (e.g., cron-job.org) to call it every 30 minutes
//
// NOTE: scheduleUploadSessionCleanup() below is DEPRECATED and only runs once on startup

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
