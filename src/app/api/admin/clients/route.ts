import { NextResponse } from 'next/server';
import { hash } from 'bcryptjs';
import { prisma } from '@/lib/db';
import { successResponse, serverErrorResponse, errorResponse, notFoundResponse } from '@/lib/api/response';
import { clientSchema, clientUpdateSchema, idSchema, validateRequest } from '@/lib/api/validation';
import { requireAdminAuth } from '@/lib/auth/require-admin-auth';
import { collectPhotoDeletionPayloads, enqueueDeletionWithOutbox } from '@/lib/cloudflare-queue';
import { logger } from '@/lib/logger';
import { parseAdminPaginationSafe, createAdminPaginationResponse } from '@/types/pagination';
import { RATE_LIMITS } from '@/lib/rate-limit';
import { enforceRateLimit } from '@/lib/rate-limit-helper';

// bcrypt cost factor for client portal passwords. Matches the dummy hash
// shape used in lib/auth/options.ts for timing-attack protection.
const BCRYPT_ROUNDS = 10;

export async function GET(request: Request) {
  try {
    const auth = await requireAdminAuth();
    if (auth instanceof NextResponse) return auth;

    // Rate limiting
    const rateLimit = await enforceRateLimit({
      identifier: `clients:get:${auth.user.email}`,
      limit: RATE_LIMITS.ADMIN_READ
    });
    if (rateLimit) return rateLimit;

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
          photoCount: true, // Use maintained column for accurate photo count
          isApproved: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.client.count(),
    ]);

    // Transform to match expected response shape
    const clientsWithUsage = clients.map(({ usedStorage, photoCount, ...client }) => ({
      ...client,
      usedStorageBytes: usedStorage.toString(),
      photoCount,
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
    const auth = await requireAdminAuth();
    if (auth instanceof NextResponse) return auth;

    // Rate limiting
    const rateLimit = await enforceRateLimit({
      identifier: `clients:post:${auth.user.email}`,
      limit: RATE_LIMITS.ADMIN_WRITE
    });
    if (rateLimit) return rateLimit;

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
      return errorResponse('Email already registered', 409);
    }
    return serverErrorResponse('Failed to create client');
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await requireAdminAuth();
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
      return errorResponse('Email already registered', 409);
    }
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2025') {
      return notFoundResponse('Client not found');
    }
    return serverErrorResponse('Failed to update client');
  }
}

export async function DELETE(request: Request) {
  try {
    const auth = await requireAdminAuth();
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