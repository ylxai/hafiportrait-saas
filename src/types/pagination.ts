/**
 * Pagination types and utilities for PhotoStudio SaaS
 * 
 * Two pagination strategies are used:
 * 1. Offset-based (Admin APIs) - For dashboards with page numbers
 * 2. Cursor-based (Public APIs) - For infinite scroll
 */

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
 * 
 * @param searchParams - URLSearchParams from request.url
 * @param defaultLimit - Default items per page (default: 20)
 * @returns Validated pagination params with calculated skip
 * 
 * @example
 * const { page, limit, skip } = parseAdminPagination(searchParams);
 * const items = await prisma.item.findMany({ skip, take: limit });
 */
export function parseAdminPagination(
  searchParams: URLSearchParams,
  defaultLimit = 20
): AdminPaginationParams {
  const pageRaw = parseInt(searchParams.get('page') ?? '1', 10);
  const page = Number.isNaN(pageRaw) ? 1 : Math.max(1, pageRaw);
  
  const limitRaw = parseInt(searchParams.get('limit') ?? String(defaultLimit), 10);
  const limit = Number.isNaN(limitRaw) ? defaultLimit : Math.min(100, Math.max(1, limitRaw));
  
  const skip = (page - 1) * limit;
  
  return { page, limit, skip };
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
 * 
 * @param searchParams - URLSearchParams from request.url
 * @returns Validated cursor or undefined
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
  
  return cursor;
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
