// MEDIUM PRIORITY FIX #5: Cleanup expired upload sessions
import { prisma } from '@/lib/db';

export async function cleanupExpiredUploadSessions(): Promise<number> {
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

// CRITICAL FIX: Removed setInterval - incompatible with serverless/edge environments
// Use Cloudflare Cron Triggers instead for scheduled cleanup
// See: https://developers.cloudflare.com/workers/configuration/cron-triggers/
//
// Example wrangler.toml configuration:
// [triggers]
// crons = ["*/30 * * * *"]  # Every 30 minutes
//
// Then in your worker:
// export default {
//   async scheduled(event, env, ctx) {
//     await cleanupExpiredUploadSessions();
//   }
// }
//
// For local development, call cleanupExpiredUploadSessions() manually via API endpoint

export async function scheduleUploadSessionCleanup(): Promise<void> {
  console.warn('[Cleanup] scheduleUploadSessionCleanup() is deprecated. Use Cloudflare Cron Triggers instead.');
  console.warn('[Cleanup] See: https://developers.cloudflare.com/workers/configuration/cron-triggers/');
  
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
