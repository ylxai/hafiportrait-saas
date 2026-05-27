import { prisma } from '@/lib/db';
import { BYTES_PER_GB } from '@/lib/upload/constants';
// Note: logger is NOT imported here because storage/accounts.ts is imported
// by cloudinary.ts which is used in client components (PhotoImage.tsx).
// Using logger would pull in node:async_hooks which is unavailable in browser.

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
  storageLimitGB?: number | null;
  usedStorage?: bigint | null;
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
  // Atomic decrement using GREATEST to clamp at 0 — no read-then-write race.
  // Two concurrent decrements cannot double-count bytes back because the
  // subtraction and clamp happen in a single SQL statement.
  //
  // H7 fix: replaced the previous $transaction(findUnique + update) pattern
  // which was vulnerable to READ COMMITTED isolation allowing concurrent
  // decrements to both read the same value and write the same smaller result.
  const result = await prisma.$executeRaw`
    UPDATE "StorageAccount"
    SET
      "usedStorage" = GREATEST("usedStorage" - ${fileSize}::bigint, 0::bigint),
      "totalPhotos" = GREATEST("totalPhotos" - 1, 0)
    WHERE id = ${accountId}
  `;

  if (result === 0) {
    // Account not found — log and return silently
    console.warn('storage.decrease.account_not_found', { accountId });
    return;
  }

  // Detect if clamp triggered by checking current value
  const account = await prisma.storageAccount.findUnique({
    where: { id: accountId },
    select: { usedStorage: true },
  });

  if (account?.usedStorage === BigInt(0)) {
    console.warn('storage.decrease.clamped_to_zero', {
      accountId,
      attempted: fileSize.toString(),
    });
  }
}

export async function findWorkingAccount(
  provider: 'CLOUDINARY' | 'R2',
  lastFailedAccountId?: string,
  incomingSize: bigint = BigInt(0)
): Promise<StorageAccount | null> {
  const accounts = await getStorageAccounts(provider);
  
  for (const account of accounts) {
    if (lastFailedAccountId && account.id === lastFailedAccountId) {
      continue;
    }
    
    // Skip accounts that have exceeded their storage limit
    if (account.storageLimitGB != null) {
      const limitBytes = BigInt(account.storageLimitGB) * BigInt(BYTES_PER_GB);
      const usedBytes = account.usedStorage ?? BigInt(0);
      if (usedBytes + incomingSize >= limitBytes) {
        continue; // Account is full, skip it
      }
    }
    
    return account;
  }
  
  return null;
}

/**
 * Cache TTL for Cloudinary config (1 minute)
 * Balances between fresh config and performance
 */
const CLOUDINARY_CONFIG_CACHE_TTL = 60000;

/**
 * Get active Cloudinary cloud name from database.
 * Falls back to environment variable if no active account found.
 * Cached for performance.
 */
let cloudinaryConfigCache: { cloudName: string; cachedAt: number } | null = null;

export async function getCloudinaryConfig(): Promise<{ cloudName: string }> {
  // Check cache
  if (cloudinaryConfigCache && Date.now() - cloudinaryConfigCache.cachedAt < CLOUDINARY_CONFIG_CACHE_TTL) {
    return { cloudName: cloudinaryConfigCache.cloudName };
  }

  // Try to get from database
  const account = await getDefaultAccount('CLOUDINARY');
  
  if (account?.cloudName) {
    cloudinaryConfigCache = {
      cloudName: account.cloudName,
      cachedAt: Date.now(),
    };
    return { cloudName: account.cloudName };
  }

  // Sprint 3 Task 3.3: env fallback removed — cloudName must come from DB.
  // If no active Cloudinary account is configured, throw so callers surface
  // a clear configuration error rather than silently using a stale env var.
  throw new Error('Cloudinary cloud name not configured. Add a Cloudinary storage account in admin settings.');
}
