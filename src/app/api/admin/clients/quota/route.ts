import { successResponse, errorResponse, serverErrorResponse } from '@/lib/api/response';
import { prisma } from '@/lib/db';
import { NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/auth/require-admin-auth';
import { z } from 'zod';
import { BYTES_PER_GB } from '@/lib/upload/constants';
import { withRequestContext } from '@/lib/with-request-context';
import { logger } from '@/lib/logger';
import { isPrismaError } from '@/lib/prisma-error';
import { enforceBodySizeLimit, BODY_LIMITS } from '@/lib/api/body-size-limit';

const updateQuotaSchema = z.object({
  clientId: z.string().min(1, 'Client ID is required'),
  storageQuotaGB: z.number()
    .int('Quota must be a whole number')
    .min(1, 'Minimum quota is 1 GB')
    .max(1000, 'Maximum quota is 1000 GB'),
});

export const PATCH = withRequestContext(async (request: Request) => {
  try {
    const auth = await requireAdminAuth();
    if (auth instanceof NextResponse) return auth;

    const tooLarge = enforceBodySizeLimit(request, BODY_LIMITS.JSON_SMALL);
    if (tooLarge) return tooLarge;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return errorResponse('Invalid JSON body', 400);
    }
    const validation = updateQuotaSchema.safeParse(body);

    if (!validation.success) {
      const firstError = validation.error.errors[0];
      return errorResponse(`${firstError.path.join('.')}: ${firstError.message}`, 400);
    }

    const { clientId, storageQuotaGB } = validation.data;

    // Update quota directly — Prisma throws P2025 if client not found
    const updatedClient = await prisma.client.update({
      where: { id: clientId },
      data: { storageQuotaGB },
      select: { nama: true, email: true },
    });

    logger.info('admin.client_quota.updated', {
      clientId,
      storageQuotaGB,
      clientEmail: updatedClient.email,
    });

    return successResponse({
      clientId,
      clientName: updatedClient.nama,
      storageQuotaGB,
    });
  } catch (error) {
    logger.error('admin.client_quota.update_failed', { err: error });
    if (isPrismaError(error, 'P2025')) {
      return errorResponse('Client not found', 404);
    }
    return serverErrorResponse('Failed to update client quota');
  }
});

export const GET = withRequestContext(async (request: Request) => {
  try {
    const auth = await requireAdminAuth();
    if (auth instanceof NextResponse) return auth;

    const { searchParams } = new URL(request.url);
    const clientId = searchParams.get('clientId');

    if (!clientId) {
      return errorResponse('clientId query parameter is required', 400);
    }

    const client = await prisma.client.findUnique({
      where: { id: clientId },
      select: {
        id: true,
        nama: true,
        email: true,
        storageQuotaGB: true,
      },
    });

    if (!client) {
      return errorResponse('Client not found', 404);
    }

    // Calculate usage
    const usage = await prisma.photo.aggregate({
      where: {
        gallery: {
          event: {
            clientId,
          },
        },
      },
      _sum: {
        fileSize: true,
      },
      _count: true,
    });

    const totalUsed = usage._sum.fileSize || BigInt(0);
    const quotaBytes = BigInt(client.storageQuotaGB) * BigInt(BYTES_PER_GB);
    // Multiply by 10000 before division for decimal precision, then divide back
    const usagePercent = quotaBytes > BigInt(0) ? Number((totalUsed * BigInt(10000)) / quotaBytes) / 100 : 0;

    return successResponse({
      client: {
        id: client.id,
        nama: client.nama,
        email: client.email,
        storageQuotaGB: client.storageQuotaGB,
        usedStorageBytes: totalUsed.toString(),
        usedStorageGB: (Number(totalUsed) / BYTES_PER_GB).toFixed(2),
        usagePercent: usagePercent.toString(),
        photoCount: usage._count,
      },
    });
  } catch (error) {
    logger.error('admin.client_quota.fetch_failed', { err: error });
    return serverErrorResponse('Failed to fetch client quota');
  }
});
