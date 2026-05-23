import { getDefaultAccount } from '@/lib/storage/accounts';
import { successResponse, errorResponse } from '@/lib/api/response';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';
import { RATE_LIMITS } from '@/lib/rate-limit';
import { enforceRateLimit } from '@/lib/rate-limit-helper';

/**
 * GET /api/admin/storage-config
 * 
 * Returns storage configuration from default accounts.
 * No input validation needed - read-only endpoint with no parameters.
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return errorResponse('Unauthorized', 401);
  }

  // Rate limiting
  const rateLimit = await enforceRateLimit({
    identifier: `storage-config:get:${session.user.email}`,
    limit: RATE_LIMITS.ADMIN_READ
  });
  if (rateLimit) return rateLimit;

  const cloudinaryAccount = await getDefaultAccount('CLOUDINARY');
  const r2Account = await getDefaultAccount('R2');

  const config = {
    cloudinary: {
      cloudName: cloudinaryAccount?.cloudName || '',
    },
    r2: {
      accountId: r2Account?.accountId || '',
      bucketName: r2Account?.bucketName || '',
      publicUrl: r2Account?.publicUrl || '',
      endpoint: r2Account?.endpoint || '',
    },
  };

  return successResponse(config);
}