import { prisma } from '@/lib/db';

export interface RotationSchedule {
  frequency: 'daily' | 'weekly' | 'monthly' | 'custom';
  customCron?: string;
}

export async function getAccountsNeedingRotation(): Promise<string[]> {
  const accounts = await prisma.storageAccount.findMany({
    where: {
      rotationEnabled: true,
      rotationNextDate: { lte: new Date() },
      isActive: true,
    },
    select: { id: true },
  });
  
  return accounts.map(a => a.id);
}

export async function shouldUseSecondaryCredentials(
  accountId: string
): Promise<boolean> {
  const account = await prisma.storageAccount.findUnique({
    where: { id: accountId },
    select: {
      isSecondaryActive: true,
      secondaryApiKey: true,
      secondarySecret: true,
    },
  });

  if (!account) return false;
  
  return account.isSecondaryActive && !!account.secondaryApiKey && !!account.secondarySecret;
}

export async function rotateStorageCredentials(
  accountId: string
): Promise<{ success: boolean; error?: string }> {
  const account = await prisma.storageAccount.findUnique({
    where: { id: accountId },
  });

  if (!account) {
    return { success: false, error: 'Account not found' };
  }

  if (account.provider === 'CLOUDINARY') {
    if (!account.secondaryApiKey || !account.secondarySecret) {
      return { success: false, error: 'Secondary credentials not set' };
    }

    await prisma.storageAccount.update({
      where: { id: accountId },
      data: {
        apiKey: account.secondaryApiKey,
        apiSecret: account.secondarySecret,
        secondaryApiKey: null,
        secondarySecret: null,
        isSecondaryActive: false,
        lastRotatedAt: new Date(),
      },
    });
  } else if (account.provider === 'R2') {
    if (!account.secondaryAccessKey || !account.secondarySecret) {
      return { success: false, error: 'Secondary credentials not set' };
    }

    await prisma.storageAccount.update({
      where: { id: accountId },
      data: {
        accessKey: account.secondaryAccessKey,
        secretKey: account.secondarySecret,
        secondaryAccessKey: null,
        secondarySecret: null,
        isSecondaryActive: false,
        lastRotatedAt: new Date(),
      },
    });
  }

  await scheduleNextRotation(accountId);
  return { success: true };
}

export async function setSecondaryCredentials(
  accountId: string,
  credentials: {
    apiKey?: string;
    apiSecret?: string;
    accessKey?: string;
    secretKey?: string;
  }
): Promise<{ success: boolean; error?: string }> {
  const account = await prisma.storageAccount.findUnique({
    where: { id: accountId },
  });

  if (!account) {
    return { success: false, error: 'Account not found' };
  }

  const updateData: Record<string, string | null | boolean> = {
    isSecondaryActive: true,
  };

  if (account.provider === 'CLOUDINARY') {
    if (credentials.apiKey) updateData.secondaryApiKey = credentials.apiKey;
    if (credentials.apiSecret) updateData.secondarySecret = credentials.apiSecret;
  } else if (account.provider === 'R2') {
    if (credentials.accessKey) updateData.secondaryAccessKey = credentials.accessKey;
    if (credentials.secretKey) updateData.secondarySecret = credentials.secretKey;
  }

  await prisma.storageAccount.update({
    where: { id: accountId },
    data: updateData,
  });

  return { success: true };
}

export async function scheduleNextRotation(accountId: string): Promise<void> {
  const account = await prisma.storageAccount.findUnique({
    where: { id: accountId },
    select: { rotationSchedule: true, rotationEnabled: true },
  });

  if (!account || !account.rotationEnabled || !account.rotationSchedule) {
    return;
  }

  let nextDate: Date;
  const now = new Date();

  switch (account.rotationSchedule) {
    case 'daily':
      nextDate = new Date(now);
      nextDate.setDate(nextDate.getDate() + 1);
      nextDate.setHours(0, 0, 0, 0);
      break;
    case 'weekly':
      nextDate = new Date(now);
      nextDate.setDate(nextDate.getDate() + 7);
      nextDate.setHours(0, 0, 0, 0);
      break;
    case 'monthly':
      nextDate = new Date(now);
      nextDate.setMonth(nextDate.getMonth() + 1);
      nextDate.setDate(1);
      nextDate.setHours(0, 0, 0, 0);
      break;
    default:
      return;
  }

  await prisma.storageAccount.update({
    where: { id: accountId },
    data: { rotationNextDate: nextDate },
  });
}

export async function enableKeyRotation(
  accountId: string,
  schedule: RotationSchedule
): Promise<{ success: boolean; error?: string }> {
  const account = await prisma.storageAccount.findUnique({
    where: { id: accountId },
  });

  if (!account) {
    return { success: false, error: 'Account not found' };
  }

  await prisma.storageAccount.update({
    where: { id: accountId },
    data: {
      rotationEnabled: true,
      rotationSchedule: schedule.frequency === 'custom' 
        ? schedule.customCron ?? null 
        : schedule.frequency,
    },
  });

  await scheduleNextRotation(accountId);
  return { success: true };
}

export async function disableKeyRotation(
  accountId: string
): Promise<{ success: boolean; error?: string }> {
  await prisma.storageAccount.update({
    where: { id: accountId },
    data: {
      rotationEnabled: false,
      rotationSchedule: null,
      rotationNextDate: null,
    },
  });

  return { success: true };
}

export function getActiveCredentials(
  account: {
    apiKey?: string | null;
    apiSecret?: string | null;
    accessKey?: string | null;
    secretKey?: string | null;
    secondaryApiKey?: string | null;
    secondarySecret?: string | null;
    secondaryAccessKey?: string | null;
    isSecondaryActive?: boolean | null;
    provider: 'CLOUDINARY' | 'R2';
  }
): {
  apiKey?: string;
  apiSecret?: string;
  accessKey?: string;
  secretKey?: string;
} {
  if (account.isSecondaryActive) {
    if (account.provider === 'CLOUDINARY') {
      return {
        apiKey: account.secondaryApiKey ?? undefined,
        apiSecret: account.secondarySecret ?? undefined,
      };
    } else {
      return {
        accessKey: account.secondaryAccessKey ?? undefined,
        secretKey: account.secondarySecret ?? undefined,
      };
    }
  }

  return {
    apiKey: account.apiKey ?? undefined,
    apiSecret: account.apiSecret ?? undefined,
    accessKey: account.accessKey ?? undefined,
    secretKey: account.secretKey ?? undefined,
  };
}
