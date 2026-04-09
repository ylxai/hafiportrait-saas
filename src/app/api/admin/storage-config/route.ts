import { getDefaultAccount } from '@/lib/storage/accounts';
import { successResponse } from '@/lib/api/response';

export async function GET() {
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