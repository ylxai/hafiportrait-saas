import { prisma } from '@/lib/db';
import { getActiveCredentials } from './rotation';

type StorageAccount = {
  id: string;
  name: string;
  provider: 'CLOUDINARY' | 'R2';
  isActive: boolean;
  isDefault: boolean;
  priority: number;
  cloudName?: string | null;
  apiKey?: string | null;
  apiSecret?: string | null;
  uploadPreset?: string | null;
  accountId?: string | null;
  accessKey?: string | null;
  secretKey?: string | null;
  bucketName?: string | null;
  publicUrl?: string | null;
  endpoint?: string | null;
  secondaryApiKey?: string | null;
  secondarySecret?: string | null;
  secondaryAccessKey?: string | null;
  isSecondaryActive?: boolean | null;
};

export async function getStorageAccounts(provider: 'CLOUDINARY' | 'R2'): Promise<StorageAccount[]> {
  return prisma.storageAccount.findMany({
    where: { provider, isActive: true },
    orderBy: [{ isDefault: 'desc' }, { priority: 'asc' }],
  });
}

export async function getDefaultAccount(provider: 'CLOUDINARY' | 'R2'): Promise<StorageAccount | null> {
  return prisma.storageAccount.findFirst({
    where: { provider, isActive: true, isDefault: true },
    orderBy: { priority: 'asc' },
  });
}

export async function getStorageAccountById(id: string): Promise<StorageAccount | null> {
  return prisma.storageAccount.findUnique({ where: { id } });
}

export async function updateStorageUsage(accountId: string, fileSize: bigint) {
  // Use atomic increment - race condition safe
  await prisma.storageAccount.update({
    where: { id: accountId },
    data: {
      usedStorage: { increment: fileSize },
      totalPhotos: { increment: 1 },
    },
  });
}

export async function decreaseStorageUsage(accountId: string, fileSize: bigint) {
  // Use transaction to ensure consistency
  await prisma.$transaction(async (tx) => {
    const account = await tx.storageAccount.findUnique({ where: { id: accountId } });
    if (!account) return;
    
    // Only decrement if we have enough storage
    const newUsedStorage = account.usedStorage - fileSize;
    const newTotalPhotos = account.totalPhotos - 1;
    
    await tx.storageAccount.update({
      where: { id: accountId },
      data: {
        // Note: BigInt(0) used for ES2017 compatibility (0n requires ES2020+)
        usedStorage: newUsedStorage > BigInt(0) ? newUsedStorage : BigInt(0),
        totalPhotos: newTotalPhotos > 0 ? newTotalPhotos : 0,
      },
    });
  });
}

export async function findWorkingAccount(
  provider: 'CLOUDINARY' | 'R2',
  lastFailedAccountId?: string
): Promise<StorageAccount | null> {
  const accounts = await getStorageAccounts(provider);
  
  for (const account of accounts) {
    if (lastFailedAccountId && account.id === lastFailedAccountId) {
      continue;
    }
    return account;
  }
  
  return null;
}

/**
 * Get active storage credentials for an account.
 * Respects isSecondaryActive flag for zero-downtime rotation.
 */
export async function getStorageCredentials(accountId: string) {
  const account = await prisma.storageAccount.findUnique({
    where: { id: accountId },
    select: {
      id: true,
      provider: true,
      apiKey: true,
      apiSecret: true,
      accessKey: true,
      secretKey: true,
      secondaryApiKey: true,
      secondaryApiSecret: true,
      secondaryAccessKey: true,
      secondarySecretKey: true,
      isSecondaryActive: true,
      cloudName: true,
      bucketName: true,
      endpoint: true,
      publicUrl: true,
    },
  });

  if (!account) {
    throw new Error(`Storage account ${accountId} not found`);
  }

  const credentials = getActiveCredentials(account);

  return {
    provider: account.provider,
    cloudName: account.cloudName,
    bucketName: account.bucketName,
    endpoint: account.endpoint,
    publicUrl: account.publicUrl,
    ...credentials,
  };
}
