import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { successResponse, errorResponse, unauthorizedResponse } from '@/lib/api/response';

/**
 * Cleanup expired upload sessions
 * This endpoint should be called by Vercel Cron (hourly)
 * 
 * Authentication: Bearer token from environment variable
 */
export async function POST(request: Request) {
  try {
    // Verify cron secret for security
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    
    if (!cronSecret) {
      console.error('[Cleanup] CRON_SECRET not configured');
      return errorResponse('Cron job not configured', 500);
    }
    
    if (authHeader !== `Bearer ${cronSecret}`) {
      console.warn('[Cleanup] Unauthorized cleanup attempt');
      return unauthorizedResponse();
    }
    
    // Delete expired upload sessions
    const result = await prisma.uploadSession.deleteMany({
      where: {
        expiresAt: {
          lt: new Date(), // Less than current time = expired
        },
      },
    });
    
    console.log(`[Cleanup] Deleted ${result.count} expired upload sessions`);
    
    return successResponse({
      deleted: result.count,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Cleanup] Error cleaning up upload sessions:', error);
    return NextResponse.json(
      { success: false, error: 'Cleanup failed' },
      { status: 500 }
    );
  }
}

// Allow GET for manual testing (with same auth)
export async function GET(request: Request) {
  return POST(request);
}
