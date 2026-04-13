import { successResponse, errorResponse, serverErrorResponse } from '@/lib/api/response';
import { cleanupExpiredUploadSessions } from '@/lib/upload/cleanup';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return errorResponse('Unauthorized', 401);
    }

    const { searchParams } = new URL(request.url);
    const dryRun = searchParams.get('dryRun') === 'true';

    // Cleanup expired upload sessions
    const deletedCount = await cleanupExpiredUploadSessions();

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