/**
 * Pagination types and utilities for PhotoStudio SaaS
 * 
 * Two pagination strategies are used:
 * 1. Offset-based (Admin APIs) - For dashboards with page numbers
 * 2. Cursor-based (Public APIs) - For infinite scroll
 */

import { z } from 'zod';

// ============================================================================
// ZOD SCHEMAS
// ============================================================================

/**
 * Zod schema for admin pagination query parameters
 * Validates page (≥1, ≤10000) and limit (1-100)
 */
export const adminPaginationSchema = z.object({
  page: z.coerce.number().int().min(1, 'Page must be at least 1').max(10000, 'Page cannot exceed 10000').default(1),
  limit: z.coerce.number().int().min(1, 'Limit must be at least 1').max(100, 'Limit cannot exceed 100').default(20),
});

/**
 * Zod schema for cursor-based pagination
 * Validates cursor format and perPage limit
 */
export const cursorPaginationSchema = z.object({
  cursor: z.string().min(1).optional(),
  perPage: z.coerce.number().int().min(1).max(100).default(20),
});

// ============================================================================
// ADMIN PAGINATION (Offset-based)
// ============================================================================

/**
 * Admin API pagination parameters
 * Used for: /api/admin/clients, /api/admin/events, /api/admin/galleries, etc.
 */
export interface AdminPaginationParams {
  page: number;    // 1-indexed page number
  limit: number;   // Items per page (max 100)
  skip: number;    // Calculated offset for Prisma
}

/**
 * Admin API pagination response
 */
export interface AdminPaginationResponse {
  page: number;    // Current page
  limit: number;   // Items per page
  total: number;   // Total items count
  pages: number;   // Total pages count
}

/**
 * Parse and validate admin pagination parameters from URL search params
 * Now uses Zod validation for robust input checking
 * 
 * @param searchParams - URLSearchParams from request.url
 * @param defaultLimit - Default items per page (default: 20)
 * @returns Validated pagination params with calculated skip
 * @throws ZodError if validation fails
 * 
 * @example
 * const { page, limit, skip } = parseAdminPagination(searchParams);
 * const items = await prisma.item.findMany({ skip, take: limit });
 */
export function parseAdminPagination(
  searchParams: URLSearchParams,
  defaultLimit = 20
): AdminPaginationParams {
  // Validate with Zod
  const validation = adminPaginationSchema.safeParse({
    page: searchParams.get('page'),
    limit: searchParams.get('limit') ?? String(defaultLimit),
  });
  
  if (!validation.success) {
    throw validation.error;
  }
  
  const { page, limit } = validation.data;
  const skip = (page - 1) * limit;
  
  return { page, limit, skip };
}

/**
 * Safe version of parseAdminPagination that returns validation result
 * Use this when you want to handle validation errors manually
 * 
 * @param searchParams - URLSearchParams from request.url
 * @param defaultLimit - Default items per page (default: 20)
 * @returns SafeParseReturnType with success/error
 * 
 * @example
 * const result = parseAdminPaginationSafe(searchParams);
 * if (!result.success) {
 *   return errorResponse(result.error.errors[0].message, 400);
 * }
 * const { page, limit, skip } = result.data;
 */
export function parseAdminPaginationSafe(
  searchParams: URLSearchParams,
  defaultLimit = 20
): z.SafeParseReturnType<unknown, AdminPaginationParams> {
  const validation = adminPaginationSchema.safeParse({
    page: searchParams.get('page'),
    limit: searchParams.get('limit') ?? String(defaultLimit),
  });
  
  if (!validation.success) {
    return validation;
  }
  
  const { page, limit } = validation.data;
  const skip = (page - 1) * limit;
  
  return {
    success: true,
    data: { page, limit, skip },
  };
}

/**
 * Create admin pagination response object
 * 
 * @param page - Current page number
 * @param limit - Items per page
 * @param total - Total items count
 * @returns Pagination response with calculated pages
 * 
 * @example
 * const pagination = createAdminPaginationResponse(page, limit, total);
 * return successResponse({ items, pagination });
 */
export function createAdminPaginationResponse(
  page: number,
  limit: number,
  total: number
): AdminPaginationResponse {
  return {
    page,
    limit,
    total,
    pages: Math.ceil(total / limit),
  };
}

// ============================================================================
// PUBLIC PAGINATION (Cursor-based)
// ============================================================================

/**
 * Public API pagination response (cursor-based)
 * Used for: /api/public/gallery/[token]
 */
export interface PublicPaginationResponse {
  hasMore: boolean;           // Whether more items exist
  nextCursor: string | null;  // Cursor for next page (null if no more)
  perPage: number;            // Items per page
}

/**
 * Parse and validate cursor from URL search params
 * Now uses Zod validation for robust input checking
 * 
 * @param searchParams - URLSearchParams from request.url
 * @returns Validated cursor or undefined
 * @throws ZodError if validation fails
 * 
 * @example
 * const cursor = parseCursor(searchParams);
 * const items = await prisma.item.findMany({ 
 *   take: perPage + 1, 
 *   cursor: cursor ? { id: cursor } : undefined 
 * });
 */
export function parseCursor(searchParams: URLSearchParams): string | undefined {
  const cursor = searchParams.get('cursor');
  
  // Filter out invalid cursor values
  if (!cursor || cursor === 'null' || cursor === 'undefined' || cursor.trim() === '') {
    return undefined;
  }
  
  // Validate cursor format (should be a valid ID)
  const validation = cursorPaginationSchema.safeParse({
    cursor,
    perPage: searchParams.get('perPage') ?? '20',
  });
  
  if (!validation.success) {
    throw validation.error;
  }
  
  return validation.data.cursor;
}

/**
 * Safe version of parseCursor that returns validation result
 * 
 * @param searchParams - URLSearchParams from request.url
 * @returns SafeParseReturnType with success/error
 * 
 * @example
 * const result = parseCursorSafe(searchParams);
 * if (!result.success) {
 *   return errorResponse(result.error.errors[0].message, 400);
 * }
 */
export function parseCursorSafe(
  searchParams: URLSearchParams
): z.SafeParseReturnType<unknown, { cursor?: string; perPage: number }> {
  const cursor = searchParams.get('cursor');
  
  // Filter out invalid cursor values
  if (!cursor || cursor === 'null' || cursor === 'undefined' || cursor.trim() === '') {
    return {
      success: true,
      data: { perPage: 20 },
    };
  }
  
  return cursorPaginationSchema.safeParse({
    cursor,
    perPage: searchParams.get('perPage') ?? '20',
  });
}

/**
 * Create public pagination response object
 * 
 * @param items - Array of items fetched (should fetch perPage + 1)
 * @param perPage - Items per page
 * @returns Pagination response with hasMore and nextCursor
 * 
 * @example
 * const photos = await prisma.photo.findMany({ take: perPage + 1 });
 * const pagination = createPublicPaginationResponse(photos, perPage);
 * const displayPhotos = photos.slice(0, perPage);
 */
export function createPublicPaginationResponse<T extends { id: string }>(
  items: T[],
  perPage: number
): PublicPaginationResponse {
  const hasMore = items.length > perPage;
  const nextCursor = hasMore ? items[perPage - 1].id : null;
  
  return {
    hasMore,
    nextCursor,
    perPage,
  };
}