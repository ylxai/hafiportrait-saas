import { getDefaultAccount } from '@/lib/storage/accounts';
import { successResponse, errorResponse } from '@/lib/api/response';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return errorResponse('Unauthorized', 401);
  }

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