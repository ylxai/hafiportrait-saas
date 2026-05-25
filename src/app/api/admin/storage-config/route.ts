import { getDefaultAccount } from '@/lib/storage/accounts';
import { successResponse } from '@/lib/api/response';
import { NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/auth/require-admin-auth';
import { RATE_LIMITS } from '@/lib/rate-limit';
import { enforceRateLimit } from '@/lib/rate-limit-helper';

/**
 * GET /api/admin/storage-config
 * 
 * Returns storage configuration from default accounts.
 * No input validation needed - read-only endpoint with no parameters.
 */
export async function GET() {
  const auth = await requireAdminAuth();
  if (auth instanceof NextResponse) return auth;

  // Rate limiting
  const rateLimit = await enforceRateLimit({
    identifier: `storage-config:get:${auth.user.email}`,
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