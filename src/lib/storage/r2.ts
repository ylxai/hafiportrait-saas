import { S3Client } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';

export interface R2Credentials {
  accountId: string;
  accessKey: string;
  secretKey: string;
  bucketName: string;
  publicUrl: string;
  endpoint?: string;
}

export function getR2Client(credentials: R2Credentials): S3Client {
  if (!credentials || !credentials.accountId || !credentials.accessKey || !credentials.secretKey) {
    throw new Error('Invalid or missing R2 credentials from database');
  }

  return new S3Client({
    region: 'auto',
    endpoint: credentials.endpoint || `https://${credentials.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: credentials.accessKey,
      secretAccessKey: credentials.secretKey,
    },
  });
}

export async function uploadToR2(
  file: Buffer,
  filename: string,
  contentType: string,
  credentials: R2Credentials
): Promise<{ url: string; key: string }> {
  const client = getR2Client(credentials);
  const bucket = credentials.bucketName;
  const publicUrl = credentials.publicUrl;

  if (!bucket || !publicUrl) {
    throw new Error('R2 Bucket name and public URL are required');
  }

  const key = `photos/${Date.now()}-${filename}`;
  
  const parallelUploads3 = new Upload({
    client,
    params: {
      Bucket: bucket,
      Key: key,
      Body: file,
      ContentType: contentType,
    },
  });

  try {
    await parallelUploads3.done();
  } catch (error) {
    throw new Error(
      `R2 upload failed for key "${key}": ${error instanceof Error ? error.message : String(error)}`
    );
  }

  const url = `${publicUrl}/${key}`;
  
  return { url, key };
}
