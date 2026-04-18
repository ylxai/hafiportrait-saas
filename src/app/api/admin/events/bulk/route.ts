import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { successResponse, serverErrorResponse, errorResponse } from '@/lib/api/response';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';
import { queuePhotosDeletionForEntities } from '@/lib/cloudflare-queue';
import { z } from 'zod';

// Zod schemas for bulk operations
const bulkUpdateSchema = z.object({
  ids: z.array(z.string().min(1, 'ID cannot be empty'))
    .min(1, 'At least one ID required')
    .max(100, 'Maximum 100 IDs allowed per request'),
  status: z.enum(['pending', 'confirmed', 'completed', 'cancelled']).optional(),
  paymentStatus: z.enum(['unpaid', 'partial', 'paid']).optional(),
}).refine(data => data.status || data.paymentStatus, {
  message: 'At least one field (status or paymentStatus) must be provided',
});

const bulkDeleteSchema = z.object({
  ids: z.array(z.string().min(1, 'ID cannot be empty'))
    .min(1, 'At least one ID required')
    .max(100, 'Maximum 100 IDs allowed per request'),
});

async function checkAuth() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return errorResponse('Unauthorized', 401);
  }
  return session;
}

export async function PATCH(request: Request) {
  try {
    const auth = await checkAuth();
    if (auth instanceof NextResponse) return auth;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return errorResponse('Invalid JSON body', 400);
    }
    
    // Validate request body
    const validation = bulkUpdateSchema.safeParse(body);
    if (!validation.success) {
      const firstError = validation.error.errors[0];
      return errorResponse(`${firstError.path.join('.')}: ${firstError.message}`, 400);
    }

    const { ids, status, paymentStatus } = validation.data;

    const updateData: Record<string, string> = {};
    if (status) updateData.status = status;
    if (paymentStatus) updateData.paymentStatus = paymentStatus;

    await prisma.event.updateMany({
      where: { id: { in: ids } },
      data: updateData,
    });

    return successResponse({ updated: ids.length });
  } catch (error) {
    console.error('Error bulk updating events:', error);
    return serverErrorResponse('Failed to update events');
  }
}

export async function DELETE(request: Request) {
  try {
    const auth = await checkAuth();
    if (auth instanceof NextResponse) return auth;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return errorResponse('Invalid JSON body', 400);
    }
    
    // Validate request body
    const validation = bulkDeleteSchema.safeParse(body);
    if (!validation.success) {
      const firstError = validation.error.errors[0];
      return errorResponse(`${firstError.path.join('.')}: ${firstError.message}`, 400);
    }

    const { ids } = validation.data;

    await queuePhotosDeletionForEntities({ gallery: { eventId: { in: ids } } });

    await prisma.event.deleteMany({
      where: { id: { in: ids } },
    });

    return successResponse({ deleted: ids.length });
  } catch (error) {
    console.error('Error bulk deleting events:', error);
    return serverErrorResponse('Failed to delete events');
  }
}
