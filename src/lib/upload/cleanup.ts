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

// Run cleanup on server startup or via cron
export async function scheduleUploadSessionCleanup() {
  // Run cleanup every 30 minutes
  setInterval(async () => {
    try {
      const deleted = await cleanupExpiredUploadSessions();
      if (deleted > 0) {
        console.log(`[Cleanup] Deleted ${deleted} expired upload sessions`);
      }
    } catch (error) {
      console.error('[Cleanup] Failed to cleanup upload sessions:', error);
    }
  }, 30 * 60 * 1000); // 30 minutes
  
  // Run immediately on startup
  try {
    const deleted = await cleanupExpiredUploadSessions();
    if (deleted > 0) {
      console.log(`[Cleanup] Initial cleanup: deleted ${deleted} expired upload sessions`);
    }
  } catch (error) {
    console.error('[Cleanup] Initial cleanup failed:', error);
  }
}
