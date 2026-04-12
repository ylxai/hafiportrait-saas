import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { PutObjectCommand, DeleteObjectCommand, GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
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
  r2AccountId?: string,
  cloudinaryAccountId?: string
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
  
  // Generate cryptographically secure upload ID
  const uploadId = `${timestamp}-${crypto.randomUUID()}`;
  
  // Get the actual account ID for storage tracking
  let actualR2AccountId: string | null = r2AccountId || null;
  if (!actualR2AccountId && credentials) {
    const r2Account = await prisma.storageAccount.findFirst({
      where: { 
        provider: 'R2', 
        isActive: true,
        accountId: credentials.accountId || undefined,
      },
    });
    actualR2AccountId = r2Account?.id || null;
  }

  // Validate Cloudinary account if provided
  let actualCloudinaryAccountId: string | null = cloudinaryAccountId || null;
  if (cloudinaryAccountId) {
    const cloudinaryAccount = await prisma.storageAccount.findUnique({
      where: { id: cloudinaryAccountId },
    });
    if (!cloudinaryAccount || cloudinaryAccount.provider !== 'CLOUDINARY') {
      throw new Error('Invalid Cloudinary storage account');
    }
    actualCloudinaryAccountId = cloudinaryAccountId;
  } else {
    // Use default Cloudinary account
    const defaultCloudinary = await prisma.storageAccount.findFirst({
      where: { provider: 'CLOUDINARY', isActive: true, isDefault: true },
    });
    actualCloudinaryAccountId = defaultCloudinary?.id || null;
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
      storageAccountId: actualR2AccountId,
      cloudinaryAccountId: actualCloudinaryAccountId,
      publicUrl,
    },
  });
  
  return { presignedUrl, publicUrl, r2Key, uploadId, r2AccountId: actualR2AccountId };
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
  cloudinaryAccountId?: string | null;
  error?: string;
}> {
  const session = await prisma.uploadSession.findUnique({
    where: { id: uploadId },
  });
  
  if (!session) {
    return { success: false, error: 'Upload session expired or not found' };
  }
  
  // Verify file actually exists in R2 using HeadObject
  try {
    const { credentials, bucket } = await getR2Credentials(session.storageAccountId || undefined);
    const client = getR2Client(credentials);
    
    const command = new HeadObjectCommand({
      Bucket: bucket,
      Key: session.r2Key,
    });
    
    await client.send(command);
  } catch (error) {
    console.error('R2 verification failed - file not found:', error);
    // Clean up the orphaned upload session
    await prisma.uploadSession.delete({ where: { id: uploadId } }).catch(() => {});
    return { success: false, error: 'File tidak ditemukan di storage. Upload mungkin gagal.' };
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
    cloudinaryAccountId: session.cloudinaryAccountId,
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
