import { successResponse, errorResponse, serverErrorResponse } from '@/lib/api/response';
import { prisma } from '@/lib/db';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';
import { z } from 'zod';
import { BYTES_PER_GB } from '@/lib/upload/constants';

const updateQuotaSchema = z.object({
  clientId: z.string().min(1, 'Client ID is required'),
  storageQuotaGB: z.number()
    .int('Quota must be a whole number')
    .min(1, 'Minimum quota is 1 GB')
    .max(1000, 'Maximum quota is 1000 GB'),
});

export async function PATCH(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return errorResponse('Unauthorized', 401);
    }

    const body: unknown = await request.json();
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

    console.log(`[Quota] Updated quota for ${updatedClient.nama} (${updatedClient.email}) to ${storageQuotaGB}GB`);

    return successResponse({
      clientId,
      clientName: updatedClient.nama,
      storageQuotaGB,
    });
  } catch (error) {
    console.error('Error updating client quota:', error);
    if (error && typeof error === 'object' && 'code' in error && (error as { code: string }).code === 'P2025') {
      return errorResponse('Client not found', 404);
    }
    return serverErrorResponse('Failed to update client quota');
  }
}

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return errorResponse('Unauthorized', 401);
    }

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
    console.error('Error fetching client quota:', error);
    return serverErrorResponse('Failed to fetch client quota');
  }
}
