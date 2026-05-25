import { prisma } from '@/lib/db';
import { successResponse, errorResponse, serverErrorResponse } from '@/lib/api/response';
import { NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/auth/require-admin-auth';
import { Prisma } from '@/generated/prisma';
import { z } from 'zod';
import { RATE_LIMITS } from '@/lib/rate-limit';
import { enforceRateLimit } from '@/lib/rate-limit-helper';
import { withRequestContext } from '@/lib/with-request-context';
import { logger } from '@/lib/logger';
import { enforceBodySizeLimit, BODY_LIMITS } from '@/lib/api/body-size-limit';
import { isPrismaError } from '@/lib/prisma-error';

// Normalize null → undefined so legacy DB rows with null JSON columns
// don't fail validation when the client round-trips settings via POST.
const nullToUndefined = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((v) => (v === null ? undefined : v), schema.optional());

// Phone may be entered with separators (space/dash/dot/parentheses); strip them
// before validation so the same digits-only regex still applies.
const phoneSchema = z
  .string()
  .transform((val) => val.replace(/[\s\-().]/g, ''))
  .refine(
    (val) => val === '' || /^(\+62|62|0)[0-9]{9,12}$/.test(val),
    { message: 'Invalid phone number format (example: 08123456789 / +628****6789)' }
  );

// Zod schema for settings update
const updateSettingsSchema = z.object({
  namaStudio: z.string().max(100, 'Studio name is too long').optional(),
  logoUrl: z.string().url('Invalid logo URL').max(500).or(z.literal('')).optional(),
  phone: phoneSchema.optional(),
  email: z.string().email('Invalid email').max(100).or(z.literal('')).optional(),
  address: z.string().max(500, 'Address is too long').optional(),
  socialMedia: nullToUndefined(z.record(z.string(), z.string())),
  bookingFields: nullToUndefined(z.record(z.string(), z.unknown())),
  notifications: nullToUndefined(z.record(z.string(), z.unknown())),
});

// Get studio settings (single row with id="studio")
export const GET = withRequestContext(async () => {
  try {
    const auth = await requireAdminAuth();
    if (auth instanceof NextResponse) return auth;

    // Rate limiting
    const rateLimit = await enforceRateLimit({
      identifier: `settings:get:${auth.user.email}`,
      limit: RATE_LIMITS.ADMIN_READ
    });
    if (rateLimit) return rateLimit;

    const settings = await prisma.settings.findUnique({
      where: { id: 'studio' },
    });

    // Return default settings if not found
    const defaultSettings = {
      id: 'studio',
      namaStudio: '',
      logoUrl: '',
      phone: '',
      email: '',
      address: '',
      socialMedia: {},
      bookingFields: {},
      notifications: {},
    };

    return successResponse({ 
      settings: settings || defaultSettings 
    });
  } catch (error) {
    logger.error('admin.settings.fetch_failed', { err: error });
    return serverErrorResponse('Failed to fetch settings');
  }
});

// Update studio settings
export const POST = withRequestContext(async (request: Request) => {
  try {
    const auth = await requireAdminAuth();
    if (auth instanceof NextResponse) return auth;

    // Rate limiting
    const rateLimit = await enforceRateLimit({
      identifier: `settings:post:${auth.user.email}`,
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
    
    // Validate request body
    const validation = updateSettingsSchema.safeParse(body);
    if (!validation.success) {
      const firstError = validation.error.errors[0];
      return errorResponse(`${firstError.path.join('.')}: ${firstError.message}`, 400);
    }

    const data = validation.data;

    // Build update + create payloads up front so both branches stay in sync.
    const updatePayload = {
      namaStudio: data.namaStudio,
      logoUrl: data.logoUrl,
      phone: data.phone,
      email: data.email,
      address: data.address,
      socialMedia: data.socialMedia as Prisma.InputJsonValue,
      bookingFields: data.bookingFields as Prisma.InputJsonValue,
      notifications: data.notifications as Prisma.InputJsonValue,
    };
    const createPayload = {
      id: 'studio',
      namaStudio: data.namaStudio || '',
      logoUrl: data.logoUrl || '',
      phone: data.phone || '',
      email: data.email || '',
      address: data.address || '',
      socialMedia: (data.socialMedia ?? {}) as Prisma.InputJsonValue,
      bookingFields: (data.bookingFields ?? {}) as Prisma.InputJsonValue,
      notifications: (data.notifications ?? {}) as Prisma.InputJsonValue,
    };

    // Settings is a singleton row (id="studio"). Prisma's upsert is not
    // atomic across concurrent requests, so under contention two callers can
    // both miss the row and race to INSERT — one wins, the other gets P2002.
    // Try create first; on P2002 fall back to a pure update so the loser of
    // the race still applies its payload.
    let settings;
    try {
      settings = await prisma.settings.create({ data: createPayload });
    } catch (error) {
      if (isPrismaError(error, 'P2002')) {
        settings = await prisma.settings.update({
          where: { id: 'studio' },
          data: updatePayload,
        });
      } else {
        throw error;
      }
    }

    return successResponse({ settings });
  } catch (error) {
    logger.error('admin.settings.save_failed', { err: error });
    return serverErrorResponse('Failed to save settings');
  }
});
