import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

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

export async function downloadFromR2(
  key: string,
  credentials: R2Credentials
): Promise<Buffer> {
  const client = getR2Client(credentials);
  const bucket = credentials.bucketName;

  if (!bucket) {
    throw new Error('R2 Bucket name is required');
  }

  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
  });

  const response = await client.send(command);
  const stream = response.Body as ReadableStream;
  
  // Convert stream to buffer
  const chunks: Buffer[] = [];
  const reader = stream.getReader();
  
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(Buffer.from(value));
  }
  
  return Buffer.concat(chunks);
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

  await parallelUploads3.done();

  const url = `${publicUrl}/${key}`;
  
  return { url, key };
}

export async function getSignedDownloadUrl(
  key: string,
  credentials: R2Credentials
): Promise<string> {
  const client = getR2Client(credentials);
  const bucket = credentials.bucketName;

  if (!bucket) {
    throw new Error('R2 Bucket name is required');
  }

  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
  });

  const signedUrl = await getSignedUrl(client, command, { expiresIn: 3600 });
  return signedUrl;
}

export function getPublicUrl(key: string, credentials: R2Credentials): string {
  return `${credentials.publicUrl}/${key}`;
}

export function extractKeyFromUrl(url: string, credentials: R2Credentials): string | null {
  const publicUrl = credentials.publicUrl;
  if (url.startsWith(publicUrl)) {
    return url.replace(publicUrl + '/', '');
  }
  return null;
}