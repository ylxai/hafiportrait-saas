import { NextResponse } from 'next/server';
import { hash } from 'bcryptjs';
import { prisma } from '@/lib/db';
import { successResponse, serverErrorResponse, errorResponse, notFoundResponse } from '@/lib/api/response';
import { clientSchema, clientUpdateSchema, idSchema, validateRequest } from '@/lib/api/validation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';
import { collectPhotoDeletionPayloads, enqueueDeletionWithOutbox } from '@/lib/cloudflare-queue';
import { logger } from '@/lib/logger';
import { parseAdminPaginationSafe, createAdminPaginationResponse } from '@/types/pagination';

// bcrypt cost factor for client portal passwords. Matches the dummy hash
// shape used in lib/auth/options.ts for timing-attack protection.
const BCRYPT_ROUNDS = 10;

async function checkAuth() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return errorResponse('Unauthorized', 401);
  }
  return session;
}

export async function GET(request: Request) {
  try {
    const auth = await checkAuth();
    if (auth instanceof NextResponse) return auth;

    const { searchParams } = new URL(request.url);
    
    // Validate pagination parameters
    const paginationResult = parseAdminPaginationSafe(searchParams);
    if (!paginationResult.success) {
      const firstError = paginationResult.error.errors[0];
      return errorResponse(`${firstError.path.join('.')}: ${firstError.message}`, 400);
    }
    
    const { page, limit, skip } = paginationResult.data;

    const [clients, total] = await Promise.all([
      prisma.client.findMany({
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip,
        // Mirror `safeClientSelect` plus `isApproved` so the admin UI can
        // render the "approve" affordance for booking-created rows.
        // Crucially we never select `password`.
        select: {
          id: true,
          nama: true,
          email: true,
          phone: true,
          instagram: true,
          storageQuotaGB: true,
          usedStorage: true, // Use existing column instead of N+1 aggregate
          isApproved: true,
          createdAt: true,
          updatedAt: true,
          _count: {
            select: {
              events: {
                where: {
                  galleries: {
                    some: {
                      photos: {
                        some: {},
                      },
                    },
                  },
                },
              },
            },
          },
        },
      }),
      prisma.client.count(),
    ]);

    // Transform to match expected response shape
    const clientsWithUsage = clients.map((client) => ({
      id: client.id,
      nama: client.nama,
      email: client.email,
      phone: client.phone,
      instagram: client.instagram,
      storageQuotaGB: client.storageQuotaGB,
      isApproved: client.isApproved,
      createdAt: client.createdAt,
      updatedAt: client.updatedAt,
      usedStorageBytes: client.usedStorage.toString(),
      photoCount: client._count.events, // Approximate count via events
    }));

    return successResponse({
      clients: clientsWithUsage,
      pagination: createAdminPaginationResponse(page, limit, total),
    });
  } catch (error) {
    console.error('Error fetching clients:', error);
    return serverErrorResponse('Failed to fetch clients');
  }
}

export async function POST(request: Request) {
  try {
    const auth = await checkAuth();
    if (auth instanceof NextResponse) return auth;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return errorResponse('Invalid JSON body', 400);
    }
    const validation = clientSchema.safeParse(body);

    if (!validation.success) {
      const firstError = validation.error.errors[0];
      return errorResponse(
        firstError.path.length > 0
          ? `${firstError.path.join('.')}: ${firstError.message}`
          : firstError.message,
        400
      );
    }

    const { password, ...rest } = validation.data;
    const passwordHash = await hash(password, BCRYPT_ROUNDS);

    const client = await prisma.client.create({
      data: { ...rest, password: passwordHash },
      // Never echo the hash (or any password material) back to the admin UI.
      select: {
        id: true,
        nama: true,
        email: true,
        phone: true,
        instagram: true,
        storageQuotaGB: true,
        isApproved: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return successResponse({ client }, 201);
  } catch (error) {
    console.error('Error creating client:', error);
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') {
      return errorResponse('Email sudah terdaftar', 409);
    }
    return serverErrorResponse('Failed to create client');
  }
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
    
    // Validate ID
    const idValidation = validateRequest(idSchema, body);
    if (!idValidation.success) {
      return errorResponse(idValidation.error, 400);
    }

    const { id } = idValidation.data;

    // Validate update data
    const dataValidation = validateRequest(clientUpdateSchema, body);
    if (!dataValidation.success) {
      return errorResponse(dataValidation.error, 400);
    }

    // If a new password is supplied, hash it before persisting; never store
    // the plaintext value the admin typed.
    const updatePayload: Record<string, unknown> = { ...dataValidation.data };
    if (typeof updatePayload.password === 'string' && updatePayload.password.length > 0) {
      updatePayload.password = await hash(updatePayload.password, BCRYPT_ROUNDS);
    } else {
      // An undefined / empty password from the form means "keep the existing
      // hash" — do not overwrite with null.
      delete updatePayload.password;
    }

    const client = await prisma.client.update({
      where: { id },
      data: updatePayload,
      select: {
        id: true,
        nama: true,
        email: true,
        phone: true,
        instagram: true,
        storageQuotaGB: true,
        isApproved: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return successResponse({ client });
  } catch (error) {
    console.error('Error updating client:', error);
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') {
      return errorResponse('Email sudah terdaftar', 409);
    }
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2025') {
      return notFoundResponse('Client not found');
    }
    return serverErrorResponse('Failed to update client');
  }
}

export async function DELETE(request: Request) {
  try {
    const auth = await checkAuth();
    if (auth instanceof NextResponse) return auth;

    const { searchParams } = new URL(request.url);
    
    // Validate ID
    const idValidation = validateRequest(idSchema, { id: searchParams.get('id') });
    if (!idValidation.success) {
      return errorResponse(idValidation.error, 400);
    }

    const { id } = idValidation.data;

    // Step 1 — collect storage payloads BEFORE the cascade nukes Photos
    // (Client → Event → Gallery → Photo). No `usedStorage` decrement is
    // necessary here because the row that holds it is itself being deleted.
    const deletionPayloads = await collectPhotoDeletionPayloads({
      gallery: { event: { clientId: id } },
    });

    // Step 2 — DB-first delete; queue stays untouched if this fails so
    // the operation is safe to retry.
    await prisma.client.delete({ where: { id } });

    // Step 3 — best-effort enqueue with outbox fallback.
    const outcome = await enqueueDeletionWithOutbox(deletionPayloads);
    if (outcome.outboxed > 0) {
      logger.warn('client.delete.storage_outboxed', {
        clientId: id,
        photoCount: outcome.outboxed,
        outboxJobId: outcome.outboxJobId,
      });
    }

    return successResponse({ success: true });
  } catch (error) {
    console.error('Error deleting client:', error);
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2025') {
      return notFoundResponse('Client not found');
    }
    return serverErrorResponse('Failed to delete client');
  }
}