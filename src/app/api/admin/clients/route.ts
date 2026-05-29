import { NextResponse } from 'next/server';
import { hash } from 'bcryptjs';
import { prisma } from '@/lib/db';
import { successResponse, serverErrorResponse, errorResponse, notFoundResponse } from '@/lib/api/response';
import { clientSchema, clientUpdateSchema, idSchema, validateRequest, formatZodError } from '@/lib/api/validation';
import { requireAdminAuth } from '@/lib/auth/require-admin-auth';
import { collectPhotoDeletionPayloads, enqueueDeletionWithOutbox } from '@/lib/cloudflare-queue';
import { buildStorageDecrements, storageDecrementOps } from '@/lib/storage/counter-utils';
import { logger } from '@/lib/logger';
import { parseAdminPaginationSafe, createAdminPaginationResponse } from '@/types/pagination';
import { RATE_LIMITS } from '@/lib/rate-limit';
import { enforceRateLimit } from '@/lib/rate-limit-helper';
import { withRequestContext } from '@/lib/with-request-context';
import { isPrismaError } from '@/lib/prisma-error';
import { enforceBodySizeLimit, BODY_LIMITS } from '@/lib/api/body-size-limit';

// bcrypt cost factor for client portal passwords. Matches the dummy hash
// shape used in lib/auth/options.ts for timing-attack protection.
const BCRYPT_ROUNDS = 10;

export const GET = withRequestContext(async (request: Request) => {
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
      return errorResponse(formatZodError(paginationResult.error), 400);
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
    const clientsWithUsage = clients.map(
      ({ usedStorage, photoCount, ...client }: (typeof clients)[number]) => ({
        ...client,
        usedStorageBytes: usedStorage.toString(),
        photoCount,
      })
    );

    return successResponse({
      clients: clientsWithUsage,
      pagination: createAdminPaginationResponse(page, limit, total),
    });
  } catch (error) {
    logger.error('admin.clients.fetch_failed', { err: error });
    return serverErrorResponse('Failed to fetch clients');
  }
});

export const POST = withRequestContext(async (request: Request) => {
  try {
    const auth = await requireAdminAuth();
    if (auth instanceof NextResponse) return auth;

    // Rate limiting
    const rateLimit = await enforceRateLimit({
      identifier: `clients:post:${auth.user.email}`,
      limit: RATE_LIMITS.ADMIN_WRITE
    });
    if (rateLimit) return rateLimit;

    const tooLarge = enforceBodySizeLimit(request, BODY_LIMITS.JSON_SMALL);
    if (tooLarge) return tooLarge;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return errorResponse('Invalid JSON body', 400);
    }
    const validation = clientSchema.safeParse(body);

    if (!validation.success) {
      return errorResponse(formatZodError(validation.error), 400);
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
    logger.error('admin.clients.create_failed', { err: error });
    if (isPrismaError(error, 'P2002')) {
      return errorResponse('Email already registered', 409);
    }
    return serverErrorResponse('Failed to create client');
  }
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
    logger.error('admin.clients.update_failed', { err: error });
    if (isPrismaError(error, 'P2002')) {
      return errorResponse('Email already registered', 409);
    }
    if (isPrismaError(error, 'P2025')) {
      return notFoundResponse('Client not found');
    }
    return serverErrorResponse('Failed to update client');
  }
});

export const DELETE = withRequestContext(async (request: Request) => {
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

    // Step 1b — Decrement StorageAccount counters using deletionPayloads.
    // Using payloads (already deduped via r2Key=null for shared files)
    // ensures cross-gallery deduplication is honored: photos that share
    // an R2 key with another row outside this delete batch must not
    // decrement disk usage.
    const storageUpdates = buildStorageDecrements(deletionPayloads);

    if (storageUpdates.size > 0) {
      await prisma.$transaction([
        ...storageDecrementOps(storageUpdates),
        prisma.client.delete({ where: { id } }),
      ]);
    } else {
      await prisma.client.delete({ where: { id } });
    }

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
    logger.error('admin.clients.delete_failed', { err: error });
    if (isPrismaError(error, 'P2025')) {
      return notFoundResponse('Client not found');
    }
    return serverErrorResponse('Failed to delete client');
  }
});