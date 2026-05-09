import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { PutObjectCommand, DeleteObjectCommand, GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getR2Client, R2Credentials } from '@/lib/storage/r2';
import { prisma } from '@/lib/db';
import { PRESIGNED_URL_EXPIRY_SECONDS, UPLOAD_SESSION_EXPIRY_MS, MAX_FILE_SIZE_BYTES, MAX_FILE_SIZE_MB, ALLOWED_EXTENSIONS } from './constants';
import { logger } from '@/lib/logger';
import path from 'path';

// MEDIUM FIX #18: ETag-based integrity sanity check.
// S3/R2 ETag rules:
//   - Single-part PUT (≤5GB)  → ETag = MD5 hex (32 chars, no dash).
//   - Multipart upload        → ETag = `<md5-of-md5s>-N` (suffixed with part count).
// We never multipart-upload here (presigned PUT only), so a missing or `-N` ETag
// indicates a corrupted/aborted upload. We can't compare with our SHA-256 hash, but
// we *can* assert that the object has a valid single-part ETag, ruling out partial writes.
const SINGLE_PART_ETAG_RE = /^"?[0-9a-f]{32}"?$/i;

// HIGH FIX #6: return accountId (DB id) explicitly to avoid ambiguous re-query
export async function getR2Credentials(accountId?: string): Promise<{ credentials: R2Credentials; bucket: string; accountDbId: string }> {
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
        accountDbId: account.id,
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
      accountDbId: defaultAccount.id,
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
  cloudinaryAccountId?: string,
  fileHash?: string // Optional: SHA-256 hash for integrity verification
): Promise<{
  presignedUrl: string;
  publicUrl: string;
  r2Key: string;
  uploadId: string;
  r2AccountId: string | null;
}> {
  // HIGH FIX #3: Validate galleryId format (cuid/uuid only) to prevent path traversal/injection
  if (!/^[a-zA-Z0-9_-]+$/.test(galleryId)) {
    throw new Error('Invalid galleryId format');
  }

  // HIGH FIX #3: Validate extension against whitelist
  const ext = path.extname(filename).toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    throw new Error(`Unsupported file extension: ${ext}`);
  }

  const { credentials, bucket, accountDbId } = await getR2Credentials(r2AccountId);
  const client = getR2Client(credentials);

  // HIGH FIX #3: UUID-based deterministic key — eliminates timestamp collisions & filename injection
  const uploadId = globalThis.crypto.randomUUID();
  const r2Key = `uploads/${galleryId}/${uploadId}${ext}`;

  // HIGH FIX #6: Use accountDbId returned from getR2Credentials (no ambiguous re-query)
  const actualR2AccountId: string = accountDbId;

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
  
  // CRITICAL FIX #1: Sign Content-Type only; enforce size via post-upload HeadObject check
  // (see verifyR2Upload). R2 (S3) PUT presigned URLs cannot enforce a ranged size — only
  // exact ContentLength can be signed. Authoritative size validation happens server-side
  // after upload using HeadObject; oversize files are deleted and session rejected.
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: r2Key,
    ContentType: contentType,
  });

  const presignedUrl = await getSignedUrl(client, command, {
    expiresIn: PRESIGNED_URL_EXPIRY_SECONDS,
  });
  
  const publicUrl = `${credentials.publicUrl}/${r2Key}`;
  
  // HIGH PRIORITY FIX #4: Set expiry from constants
  const expiresAt = new Date(Date.now() + UPLOAD_SESSION_EXPIRY_MS);
  
  // Simpan upload session di PostgreSQL
  await prisma.uploadSession.create({
    data: {
      id: uploadId,
      r2Key,
      filename,
      galleryId,
      fileSize: 0,
      fileHash, // Store hash for integrity verification
      storageAccountId: actualR2AccountId,
      cloudinaryAccountId: actualCloudinaryAccountId,
      publicUrl,
      expiresAt,
    },
  });
  
  return { presignedUrl, publicUrl, r2Key, uploadId, r2AccountId: actualR2AccountId };
}

// Verifikasi upload ke R2 berhasil
// HIGH FIX #8: Removed unused _fileSize/_width/_height params — server is authoritative.
export async function verifyR2Upload(
  uploadId: string
): Promise<{
  success: boolean;
  r2Key?: string;
  publicUrl?: string;
  filename?: string;
  galleryId?: string;
  storageAccountId?: string | null;
  cloudinaryAccountId?: string | null;
  fileSize?: number; // Server-side file size from R2
  fileHash?: string | null; // Hash from session
  error?: string;
}> {
  const session = await prisma.uploadSession.findUnique({
    where: { id: uploadId },
  });
  
  if (!session) {
    return { success: false, error: 'Upload session expired or not found' };
  }
  
  // HIGH PRIORITY FIX #4: Check if session expired
  if (session.expiresAt < new Date()) {
    await prisma.uploadSession.delete({ where: { id: uploadId } }).catch(() => {});
    return { success: false, error: 'Upload session expired (1 hour limit)' };
  }
  
  // Verify file exists and get server-side size from R2 using HeadObject
  let serverFileSize: number | undefined;
  try {
    const { credentials, bucket } = await getR2Credentials(session.storageAccountId || undefined);
    const client = getR2Client(credentials);
    
    const command = new HeadObjectCommand({
      Bucket: bucket,
      Key: session.r2Key,
    });
    
    const response = await client.send(command);
    // Use R2's ContentLength as authoritative size (NOT client-provided)
    serverFileSize = response.ContentLength ? Number(response.ContentLength) : undefined;

    // CRITICAL FIX #1: Enforce max file size server-side. If client uploaded > limit,
    // delete the object and reject the session. This is the authoritative gate.
    if (serverFileSize !== undefined && serverFileSize > MAX_FILE_SIZE_BYTES) {
      try {
        await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: session.r2Key }));
      } catch (delErr) {
        logger.error('upload.r2.delete_oversized_failed', { uploadId, r2Key: session.r2Key, err: delErr });
      }
      await prisma.uploadSession.delete({ where: { id: uploadId } }).catch(() => {});
      return { success: false, error: `File terlalu besar. Maksimal ${MAX_FILE_SIZE_MB}MB.` };
    }

    // MEDIUM FIX #18: ETag integrity sanity-check. Reject objects with multipart ETag
    // (we never multipart-upload via presigned PUT, so `-N` suffix indicates anomaly)
    // or missing/malformed ETag (storage corruption / aborted upload).
    const etag = response.ETag;
    if (!etag || !SINGLE_PART_ETAG_RE.test(etag)) {
      logger.warn('upload.r2.etag_invalid', { uploadId, r2Key: session.r2Key, etag });
      try {
        await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: session.r2Key }));
      } catch (delErr) {
        logger.error('upload.r2.delete_invalid_etag_failed', { uploadId, r2Key: session.r2Key, err: delErr });
      }
      await prisma.uploadSession.delete({ where: { id: uploadId } }).catch(() => {});
      return { success: false, error: 'File integrity check gagal (ETag tidak valid). Silakan upload ulang.' };
    }
  } catch (error) {
    logger.error('upload.r2.verify_failed', { uploadId, err: error });
    // Clean up the orphaned upload session
    await prisma.uploadSession.delete({ where: { id: uploadId } }).catch(() => {});
    return { success: false, error: 'File tidak ditemukan di storage. Upload mungkin gagal.' };
  }
  
  // Update session with server-side size, not client-provided
  await prisma.uploadSession.update({
    where: { id: uploadId },
    data: {
      fileSize: serverFileSize ? BigInt(serverFileSize) : BigInt(0),
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
    fileSize: serverFileSize, // Return server-side size
    fileHash: session.fileHash, // Return session hash (authoritative)
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
