import { prisma } from '@/lib/db';
import { Prisma } from '@/generated/prisma';

export interface RotationSchedule {
  frequency: 'daily' | 'weekly' | 'monthly';
}

export interface RotationHistoryEntry {
  rotatedAt: string; // ISO string
  initiatedBy: 'auto' | 'manual';
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

  return accounts.map((a) => a.id);
}

export async function shouldUseSecondaryCredentials(
  accountId: string
): Promise<boolean> {
  const account = await prisma.storageAccount.findUnique({
    where: { id: accountId },
    select: {
      isSecondaryActive: true,
      secondaryApiKey: true,
      secondaryApiSecret: true,
      secondaryAccessKey: true,
      secondarySecretKey: true,
      provider: true,
    },
  });

  if (!account) return false;

  if (account.provider === 'CLOUDINARY') {
    return (
      account.isSecondaryActive &&
      !!account.secondaryApiKey &&
      !!account.secondaryApiSecret
    );
  }

  // R2
  return (
    account.isSecondaryActive &&
    !!account.secondaryAccessKey &&
    !!account.secondarySecretKey
  );
}

/**
 * Atomically rotate credentials by swapping secondary → primary.
 * Uses a Prisma transaction to ensure both the credential swap and
 * schedule update succeed or fail together.
 */
export async function rotateStorageCredentials(
  accountId: string,
  initiatedBy: 'auto' | 'manual' = 'manual'
): Promise<{ success: boolean; error?: string }> {
  const account = await prisma.storageAccount.findUnique({
    where: { id: accountId },
  });

  if (!account) {
    return { success: false, error: 'Account not found' };
  }

  const now = new Date();
  const newHistoryEntry: RotationHistoryEntry = {
    rotatedAt: now.toISOString(),
    initiatedBy,
  };

  // Parse existing history, keep last 20 entries
  let history: RotationHistoryEntry[] = [];
  if (account.rotationHistory && Array.isArray(account.rotationHistory)) {
    history = account.rotationHistory as unknown as RotationHistoryEntry[];
  }
  history = [...history, newHistoryEntry].slice(-20);

  if (account.provider === 'CLOUDINARY') {
    if (!account.secondaryApiKey || !account.secondaryApiSecret) {
      return { success: false, error: 'Secondary Cloudinary credentials not set. Set secondaryApiKey and secondaryApiSecret first.' };
    }

    // Compute next rotation date before transaction
    const nextDate = computeNextRotationDate(account.rotationSchedule);

    await prisma.storageAccount.update({
      where: { id: accountId },
      data: {
        // Promote secondary → primary
        apiKey: account.secondaryApiKey,
        apiSecret: account.secondaryApiSecret,
        // Clear secondary
        secondaryApiKey: null,
        secondaryApiSecret: null,
        isSecondaryActive: false,
        lastRotatedAt: now,
        rotationHistory: history as unknown as Prisma.InputJsonValue,
        // Schedule next rotation
        rotationNextDate: nextDate,
      },
    });
  } else if (account.provider === 'R2') {
    if (!account.secondaryAccessKey || !account.secondarySecretKey) {
      return { success: false, error: 'Secondary R2 credentials not set. Set secondaryAccessKey and secondarySecretKey first.' };
    }

    const nextDate = computeNextRotationDate(account.rotationSchedule);

    await prisma.storageAccount.update({
      where: { id: accountId },
      data: {
        // Promote secondary → primary
        accessKey: account.secondaryAccessKey,
        secretKey: account.secondarySecretKey,
        // Clear secondary
        secondaryAccessKey: null,
        secondarySecretKey: null,
        isSecondaryActive: false,
        lastRotatedAt: now,
        rotationHistory: history as unknown as Prisma.InputJsonValue,
        rotationNextDate: nextDate,
      },
    });
  } else {
    return { success: false, error: `Unknown provider: ${account.provider}` };
  }

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
    select: { id: true, provider: true },
  });

  if (!account) {
    return { success: false, error: 'Account not found' };
  }

  if (account.provider === 'CLOUDINARY') {
    if (!credentials.apiKey || !credentials.apiSecret) {
      return { success: false, error: 'Both apiKey and apiSecret are required for Cloudinary secondary credentials' };
    }
    await prisma.storageAccount.update({
      where: { id: accountId },
      data: {
        secondaryApiKey: credentials.apiKey,
        secondaryApiSecret: credentials.apiSecret,
        isSecondaryActive: false,
      },
    });
  } else if (account.provider === 'R2') {
    if (!credentials.accessKey || !credentials.secretKey) {
      return { success: false, error: 'Both accessKey and secretKey are required for R2 secondary credentials' };
    }
    await prisma.storageAccount.update({
      where: { id: accountId },
      data: {
        secondaryAccessKey: credentials.accessKey,
        secondarySecretKey: credentials.secretKey,
        isSecondaryActive: false,
      },
    });
  } else {
    return { success: false, error: `Unknown provider: ${account.provider}` };
  }

  return { success: true };
}

function computeNextRotationDate(schedule: string | null): Date | null {
  if (!schedule) return null;

  const now = new Date();

  switch (schedule) {
    case 'daily': {
      const d = new Date(now);
      d.setDate(d.getDate() + 1);
      d.setHours(0, 0, 0, 0);
      return d;
    }
    case 'weekly': {
      const d = new Date(now);
      d.setDate(d.getDate() + 7);
      d.setHours(0, 0, 0, 0);
      return d;
    }
    case 'monthly': {
      const d = new Date(now);
      d.setDate(1); // Reset to 1st before adding month
      d.setMonth(d.getMonth() + 1);
      d.setHours(0, 0, 0, 0);
      return d;
    }
    default:
      return null;
  }
}

export async function scheduleNextRotation(accountId: string): Promise<void> {
  const account = await prisma.storageAccount.findUnique({
    where: { id: accountId },
    select: { rotationSchedule: true, rotationEnabled: true },
  });

  if (!account || !account.rotationEnabled || !account.rotationSchedule) {
    return;
  }

  const nextDate = computeNextRotationDate(account.rotationSchedule);
  if (!nextDate) return;

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
    select: { id: true },
  });

  if (!account) {
    return { success: false, error: 'Account not found' };
  }

  const scheduleValue = schedule.frequency;
  const nextDate = computeNextRotationDate(scheduleValue);

  await prisma.storageAccount.update({
    where: { id: accountId },
    data: {
      rotationEnabled: true,
      rotationSchedule: scheduleValue,
      rotationNextDate: nextDate,
    },
  });

  return { success: true };
}

export async function disableKeyRotation(
  accountId: string
): Promise<{ success: boolean; error?: string }> {
  const account = await prisma.storageAccount.findUnique({
    where: { id: accountId },
    select: { id: true },
  });

  if (!account) {
    return { success: false, error: 'Account not found' };
  }

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
    secondaryApiSecret?: string | null;
    secondaryAccessKey?: string | null;
    secondarySecretKey?: string | null;
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
        apiSecret: account.secondaryApiSecret ?? undefined,
      };
    } else {
      return {
        accessKey: account.secondaryAccessKey ?? undefined,
        secretKey: account.secondarySecretKey ?? undefined,
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
