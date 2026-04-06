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
  await prisma.storageAccount.update({
    where: { id: accountId },
    data: {
      usedStorage: { increment: fileSize },
      totalPhotos: { increment: 1 },
    },
  });
}

export async function decreaseStorageUsage(accountId: string, fileSize: bigint) {
  await prisma.storageAccount.update({
    where: { id: accountId },
    data: {
      usedStorage: { decrement: fileSize },
      totalPhotos: { decrement: 1 },
    },
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