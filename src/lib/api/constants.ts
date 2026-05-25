/**
 * Centralized API constants.
 *
 * Hosts cross-cutting magic numbers that previously lived inline in
 * route handlers. Keep upload-specific limits in `src/lib/upload/constants.ts`.
 */

/**
 * Maximum retry attempts for unique-constraint collisions when generating
 * `kodeBooking`. Five attempts give us > 1e15 effective code-space coverage
 * with 7-char codes, so the only realistic exhaustion path is a programming
 * error in the generator.
 *
 * Used by:
 * - src/app/api/admin/events/route.ts (admin-side event creation)
 * - src/app/api/public/booking/route.ts (self-service public booking)
 */
export const MAX_RETRIES = 5;

/**
 * bcrypt cost factor used everywhere we hash a password (admin-created
 * clients, public booking, auth dummy hash). Picked to match the ~ms-scale
 * compare time of the auth provider's dummy hash so timing channels stay
 * consistent regardless of whether a row exists.
 */
export const BCRYPT_ROUNDS = 10;

/**
 * Page size for client-portal gallery listings. The cursor-paginated
 * endpoint takes `PHOTOS_PER_PAGE + 1` rows so we can detect whether
 * a next page exists without an extra count query.
 *
 * Used by: src/app/api/portal/gallery/[token]/route.ts
 */
export const PHOTOS_PER_PAGE = 20;
