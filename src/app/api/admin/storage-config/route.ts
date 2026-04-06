import { env } from '@/lib/env';
import { successResponse } from '@/lib/api/response';

export async function GET() {
  const config = {
    cloudinary: {
      cloudName: env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || '',
    },
    r2: {
      accountId: env.R2_ACCOUNT_ID || '',
      bucketName: env.R2_BUCKET_NAME || '',
      publicUrl: env.R2_PUBLIC_URL || '',
      endpoint: env.R2_ENDPOINT || '',
    },
  };

  return successResponse(config);
}