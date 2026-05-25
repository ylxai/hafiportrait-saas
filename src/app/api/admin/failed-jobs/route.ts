import { successResponse, errorResponse } from '@/lib/api/response';
import { NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/auth/require-admin-auth';
import { z } from 'zod';
import {
  getPendingFailedJobs,
  getFailedJobStats,
  retryFailedThumbnailJob,
  resolveFailedJob,
  discardFailedJob,
  FailedJobType,
} from '@/lib/failed-jobs';
import { RATE_LIMITS } from '@/lib/rate-limit';
import { enforceRateLimit } from '@/lib/rate-limit-helper';

// GET /api/admin/failed-jobs - Get pending failed jobs or stats
export async function GET(request: Request) {
  const auth = await requireAdminAuth();
  if (auth instanceof NextResponse) return auth;

  // Rate limiting
  const rateLimit = await enforceRateLimit({
    identifier: `failed-jobs:get:${auth.user.email}`,
    limit: RATE_LIMITS.ADMIN_READ
  });
  if (rateLimit) return rateLimit;

  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action') || 'list';
  const jobType = searchParams.get('jobType') as FailedJobType | null;
  const limit = Math.min(100, parseInt(searchParams.get('limit') || '50', 10));

  if (action === 'stats') {
    const stats = await getFailedJobStats();
    return successResponse(stats);
  }

  // Default: list pending jobs
  const jobs = await getPendingFailedJobs(jobType || undefined, limit);
  return successResponse({ jobs });
}

// POST /api/admin/failed-jobs - Retry or resolve a failed job
const JobActionSchema = z.object({
  action: z.enum(['retry', 'resolve', 'discard']),
  jobId: z.string().min(1),
});

export async function POST(request: Request) {
  const auth = await requireAdminAuth();
  if (auth instanceof NextResponse) return auth;

  // Rate limiting
  const rateLimit = await enforceRateLimit({
    identifier: `failed-jobs:post:${auth.user.email}`,
    limit: RATE_LIMITS.ADMIN_WRITE
  });
  if (rateLimit) return rateLimit;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse('Invalid JSON body', 400);
  }

  const validation = JobActionSchema.safeParse(body);
  if (!validation.success) {
    const firstError = validation.error.errors[0];
    return errorResponse(`${firstError.path.join('.')}: ${firstError.message}`, 400);
  }

  const { action, jobId } = validation.data;
  const userId = auth.user.id || 'unknown';

  try {
    switch (action) {
      case 'retry': {
        const result = await retryFailedThumbnailJob(jobId);
        if (!result.success) {
          return errorResponse(result.error || 'Failed to retry job', 400);
        }
        return successResponse({ message: 'Job re-queued successfully' });
      }

      case 'resolve': {
        await resolveFailedJob(jobId, userId);
        return successResponse({ message: 'Job marked as resolved' });
      }

      case 'discard': {
        await discardFailedJob(jobId, userId);
        return successResponse({ message: 'Job discarded' });
      }

      default:
        return errorResponse('Invalid action', 400);
    }
  } catch (error) {
    console.error('[Admin/FailedJobs] Error:', error);
    return errorResponse('Internal error', 500);
  }
}
