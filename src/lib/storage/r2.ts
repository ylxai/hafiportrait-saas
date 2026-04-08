import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '@/lib/env';

const DEFAULT_ACCOUNT_ID = env.R2_ACCOUNT_ID ?? '';
const DEFAULT_ACCESS_KEY = env.R2_ACCESS_KEY ?? '';
const DEFAULT_SECRET_KEY = env.R2_SECRET_KEY ?? '';
const DEFAULT_BUCKET_NAME = env.R2_BUCKET_NAME ?? '';
const DEFAULT_PUBLIC_URL = env.R2_PUBLIC_URL ?? '';
const DEFAULT_ENDPOINT = env.R2_ENDPOINT ?? '';

export const defaultR2Client = new S3Client({
  region: 'auto',
  endpoint: DEFAULT_ENDPOINT || `https://${DEFAULT_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: DEFAULT_ACCESS_KEY,
    secretAccessKey: DEFAULT_SECRET_KEY,
  },
});

export interface R2Credentials {
  accountId: string;
  accessKey: string;
  secretKey: string;
  bucketName: string;
  publicUrl: string;
  endpoint?: string;
}

export function getR2Client(credentials?: R2Credentials): S3Client {
  if (!credentials) {
    return defaultR2Client;
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
  credentials?: R2Credentials
): Promise<Buffer> {
  const client = credentials ? getR2Client(credentials) : defaultR2Client;
  const bucket = credentials?.bucketName || DEFAULT_BUCKET_NAME;

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
  credentials?: R2Credentials
): Promise<{ url: string; key: string }> {
  const client = credentials ? getR2Client(credentials) : defaultR2Client;
  const bucket = credentials?.bucketName || DEFAULT_BUCKET_NAME;
  const publicUrl = credentials?.publicUrl || DEFAULT_PUBLIC_URL;

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
  credentials?: R2Credentials
): Promise<string> {
  const client = credentials ? getR2Client(credentials) : defaultR2Client;
  const bucket = credentials?.bucketName || DEFAULT_BUCKET_NAME;

  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
  });

  const signedUrl = await getSignedUrl(client, command, { expiresIn: 3600 });
  return signedUrl;
}

export function getPublicUrl(key: string, credentials?: R2Credentials): string {
  const publicUrl = credentials?.publicUrl || DEFAULT_PUBLIC_URL;
  return `${publicUrl}/${key}`;
}

export function extractKeyFromUrl(url: string, credentials?: R2Credentials): string | null {
  const publicUrl = credentials?.publicUrl || DEFAULT_PUBLIC_URL;
  if (url.startsWith(publicUrl)) {
    return url.replace(publicUrl + '/', '');
  }
  return null;
}