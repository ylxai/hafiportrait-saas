import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getR2Client, R2Credentials } from '@/lib/storage/r2';
import { prisma } from '@/lib/db';

// Get R2 account credentials from database
async function getR2Credentials(accountId?: string): Promise<{ credentials: R2Credentials; bucket: string }> {
  // If specific account requested
  if (accountId) {
    const account = await prisma.storageAccount.findUnique({
      where: { id: accountId },
    });
    
    if (account && account.provider === 'R2') {
      return {
        credentials: {
          accountId: account.accountId || '',
          accessKey: account.accessKey || '',
          secretKey: account.secretKey || '',
          bucketName: account.bucketName || '',
          publicUrl: account.publicUrl || '',
          endpoint: account.endpoint || undefined,
        },
        bucket: account.bucketName || '',
      };
    }
  }
  
  // Fallback to default R2 account
  const defaultAccount = await prisma.storageAccount.findFirst({
    where: { provider: 'R2', isDefault: true, isActive: true },
  });
  
  if (defaultAccount) {
    return {
      credentials: {
        accountId: defaultAccount.accountId || '',
        accessKey: defaultAccount.accessKey || '',
        secretKey: defaultAccount.secretKey || '',
        bucketName: defaultAccount.bucketName || '',
        publicUrl: defaultAccount.publicUrl || '',
        endpoint: defaultAccount.endpoint || undefined,
      },
      bucket: defaultAccount.bucketName || '',
    };
  }
  
  throw new Error('No active R2 storage account configured in database');
}

// Generate presigned URL untuk direct upload ke R2
export async function generatePresignedUploadUrl(
  filename: string,
  contentType: string,
  galleryId: string,
  r2AccountId?: string
): Promise<{
  presignedUrl: string;
  publicUrl: string;
  r2Key: string;
  uploadId: string;
  r2AccountId: string | null;
}> {
  const { credentials, bucket } = await getR2Credentials(r2AccountId);
  const client = getR2Client(credentials);
  
  // Generate unique key
  const timestamp = Date.now();
  const sanitizedFilename = filename.replace(/[^a-zA-Z0-9.-]/g, '_');
  const r2Key = `uploads/${galleryId}/${timestamp}-${sanitizedFilename}`;
  
  // Generate upload ID untuk tracking
  const uploadId = `upload_${timestamp}_${Math.random().toString(36).substr(2, 9)}`;
  
  // Get the actual account ID for storage tracking
  let actualAccountId: string | null = r2AccountId || null;
  if (!actualAccountId && credentials) {
    const account = await prisma.storageAccount.findFirst({
      where: { 
        provider: 'R2', 
        isActive: true,
        accountId: credentials.accountId || undefined,
      },
    });
    actualAccountId = account?.id || null;
  }
  
  // Generate presigned URL (valid 15 menit)
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: r2Key,
    ContentType: contentType,
  });
  
  const presignedUrl = await getSignedUrl(client, command, { 
    expiresIn: 900 // 15 minutes
  });
  
  const publicUrl = `${credentials.publicUrl}/${r2Key}`;
  
  // Simpan upload session di PostgreSQL
  await prisma.uploadSession.create({
    data: {
      id: uploadId,
      r2Key,
      filename,
      galleryId,
      fileSize: 0,
      storageAccountId: actualAccountId,
      publicUrl,
    },
  });
  
  return { presignedUrl, publicUrl, r2Key, uploadId, r2AccountId: actualAccountId };
}

// Verifikasi upload ke R2 berhasil
export async function verifyR2Upload(
  uploadId: string,
  fileSize: number,
  _width?: number,
  _height?: number
): Promise<{
  success: boolean;
  r2Key?: string;
  publicUrl?: string;
  filename?: string;
  galleryId?: string;
  storageAccountId?: string | null;
  error?: string;
}> {
  const session = await prisma.uploadSession.findUnique({
    where: { id: uploadId },
  });
  
  if (!session) {
    return { success: false, error: 'Upload session expired or not found' };
  }
  
  await prisma.uploadSession.update({
    where: { id: uploadId },
    data: {
      fileSize: BigInt(Math.floor(fileSize)),
      completedAt: new Date(),
    }
  });

  const publicUrl = session.publicUrl || '';
  
  return {
    success: true,
    r2Key: session.r2Key,
    publicUrl: publicUrl,
    filename: session.filename,
    galleryId: session.galleryId,
    storageAccountId: session.storageAccountId,
  };
}

// Cleanup upload session
export async function cleanupUploadSession(uploadId: string): Promise<void> {
  try {
    await prisma.uploadSession.delete({
      where: { id: uploadId }
    });
  } catch {
    // Ignore error if already deleted
  }
}

// Delete file dari R2
export async function deleteFromR2(
  r2Key: string,
  credentials?: R2Credentials
): Promise<void> {
  let finalCredentials = credentials;
  let bucket = credentials?.bucketName;

  if (!finalCredentials) {
    const { credentials: defaultCreds, bucket: defaultBucket } = await getR2Credentials();
    finalCredentials = defaultCreds;
    bucket = defaultBucket;
  }

  const client = getR2Client(finalCredentials);
  
  const command = new DeleteObjectCommand({
    Bucket: bucket,
    Key: r2Key,
  });
  
  await client.send(command);
}

// Generate download URL (signed, expires in 1 hour)
export async function generateDownloadUrl(
  r2Key: string,
  credentials?: R2Credentials
): Promise<string> {
  let finalCredentials = credentials;
  let bucket = credentials?.bucketName;

  if (!finalCredentials) {
    const { credentials: defaultCreds, bucket: defaultBucket } = await getR2Credentials();
    finalCredentials = defaultCreds;
    bucket = defaultBucket;
  }

  const client = getR2Client(finalCredentials);
  
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: r2Key,
  });
  
  return getSignedUrl(client, command, { expiresIn: 3600 });
}
