import { z } from 'zod';

// Common validation schemas
export const idSchema = z.object({
  id: z.string().trim().min(1, 'ID is required'),
});

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const searchQuerySchema = z.object({
  q: z.string().min(1, 'Search query required').max(200),
  type: z.enum(['clients', 'events', 'galleries', 'photos']).optional(),
});

/**
 * Input sanitization for stored plain-text fields.
 *
 * Goals (input-side):
 * - Trim and strip null bytes / Unicode control characters that could mangle
 *   the database row or downstream logs.
 * - Strip dangerous URL protocols (javascript:, data:, vbscript:) and inline
 *   event handlers (onclick=, onerror=, ...) so a value cannot be re-rendered
 *   as an active payload if it ever leaks into a context that doesn't
 *   auto-escape (e.g. dangerouslySetInnerHTML, raw HTML email templates).
 *
 * What this function intentionally does NOT do:
 * - HTML-escape ampersands / angle brackets / quotes. React (and our JSON
 *   APIs) escape values at render time, so doing it here too caused
 *   double-encoding bugs ("Wedding Jane & John" was being stored as
 *   "Wedding Jane &amp; John" and shown that way to users). Output-context
 *   escaping must live in the rendering layer, not here.
 *
 * Note: Prisma parameterizes queries, so SQL keyword stripping is intentionally
 * not done here (it corrupts legitimate user content like "Update meeting").
 * For rich text content, use a dedicated library like DOMPurify on the
 * rendering side.
 */
const sanitizeString = (str: string) =>
  str
    .trim()
    // Remove null bytes
    .replace(/\0/g, '')
    // Remove Unicode control characters (except newline, tab, carriage return)
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, '')
    // Remove dangerous URL protocols
    .replace(/javascript:/gi, '')
    .replace(/data:/gi, '')
    .replace(/vbscript:/gi, '')
    // Remove event handlers (onclick=, onerror=, etc.)
    .replace(/\bon[a-z]+\s*=/gi, '');

// Email regex for stricter validation
const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

// Phone regex (Indonesian format: +62 or 08)
const phoneRegex = /^(\+62|62|0)[0-9]{9,12}$/;

export const clientSchema = z.object({
  nama: z.string()
    .min(1, 'Name is required')
    .max(100, 'Name is too long')
    .transform(sanitizeString),
  email: z.string()
    .email('Invalid email')
    .regex(emailRegex, 'Invalid email format')
    .max(100, 'Email is too long')
    .transform((str) => str.trim().toLowerCase()),
  // Password is mandatory at create time so the client can sign in to the
  // portal and view their (now private) gallery. The API layer hashes it
  // with bcrypt before persisting.
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .max(72, 'Password must be at most 72 characters (bcrypt limit)'),
  phone: z.string()
    .nullish()
    .refine((val) => val === null || val === undefined || phoneRegex.test(val), {
      message: 'Invalid phone number format (use 08xx or +62)',
    }),
  instagram: z.string()
    .nullish()
    .refine((val) => val === null || val === undefined || /^@?[a-zA-Z0-9._]{1,30}$/.test(val), {
      message: 'Invalid Instagram format',
    }),
  storageQuotaGB: z.number()
    .int('Quota must be an integer')
    .min(1, 'Quota must be at least 1 GB')
    .max(1000, 'Quota must be at most 1000 GB')
    .optional(),
  // Admin can flip the approval gate via PATCH; not required at create time
  // (defaults to `true` for admin-created rows via the schema default).
  isApproved: z.boolean().optional(),
});

export const packageSchema = z.object({
  nama: z.string()
    .min(1, 'Package name is required')
    .max(100, 'Package name is too long')
    .transform(sanitizeString),
  description: z.string()
    .max(500, 'Description is too long')
    .nullish()
    .transform((val) => val ? sanitizeString(val) : val),
  price: z.number().min(0, 'Price cannot be negative'),
  duration: z.number().int().positive().nullish(),
  fitur: z.array(z.string()).optional().transform((val) => val === null ? undefined : val),
  maxSelection: z.number().int().min(0).default(20),
  maxDownload: z.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
});

export const eventSchema = z.object({
  clientId: z.string().min(1, 'Client is required'),
  packageId: z.string().nullish(),
  namaProject: z.string()
    .min(1, 'Project name is required')
    .max(100, 'Project name is too long')
    .transform(sanitizeString),
  eventDate: z.string()
    .refine((str) => !isNaN(Date.parse(str)), { message: 'Invalid date format' })
    .transform((str) => new Date(str)),
  location: z.string()
    .max(200, 'Location is too long')
    .nullish()
    .transform((val) => val ? sanitizeString(val) : val),
  notes: z.string()
    .max(500, 'Notes are too long')
    .nullish()
    .transform((val) => val ? sanitizeString(val) : val),
  totalPrice: z.number().int().min(0).default(0),
  status: z.enum(['pending', 'confirmed', 'completed', 'cancelled']).default('pending'),
  paymentStatus: z.enum(['unpaid', 'partial', 'paid', 'awaiting_confirmation']).default('unpaid'),
});

export const gallerySchema = z.object({
  eventId: z.string().min(1, 'Event is required'),
  namaProject: z.string()
    .min(1, 'Project name is required')
    .max(100, 'Project name is too long')
    .transform(sanitizeString),
  maxSelection: z.number().int().min(0).default(20),
  status: z.enum(['draft', 'published', 'archived']).default('draft'),
  enableDownload: z.boolean().default(false),
  welcomeMessage: z.string()
    .max(500, 'Message is too long')
    .optional()
    .transform((val) => val ? sanitizeString(val) : val),
  thankYouMessage: z.string()
    .max(500, 'Message is too long')
    .optional()
    .transform((val) => val ? sanitizeString(val) : val),
  bannerClientName: z.string()
    .max(100, 'Name is too long')
    .optional()
    .transform((val) => val ? sanitizeString(val) : val),
  bannerEventDate: z.string()
    .max(100, 'Date is too long')
    .optional()
    .transform((val) => val ? sanitizeString(val) : val),
});

export const bookingSchema = z.object({
  nama: z.string()
    .min(1, 'Name is required')
    .max(100, 'Name is too long')
    .transform(sanitizeString),
  email: z.string()
    .email('Invalid email')
    .regex(emailRegex, 'Invalid email format')
    .max(100, 'Email is too long')
    .transform((str) => str.trim().toLowerCase()),
  // Required for the portal login flow that activates *after* an admin
  // approves the booking. Same min/max constraints as `clientSchema` so the
  // hashed value is interchangeable with admin-created clients.
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .max(72, 'Password must be at most 72 characters (bcrypt limit)'),
  phone: z.string()
    .min(1, 'WhatsApp number is required')
    .regex(phoneRegex, 'Invalid phone number format (use 08xx or +62)'),
  instagram: z.string()
    .optional()
    .refine((val) => val === undefined || val === '' || /^[a-zA-Z0-9._]{1,30}$/.test(val), {
      message: 'Invalid Instagram format',
    }),
  packageId: z.string().optional(),
  eventDate: z.string()
    .refine((str) => !isNaN(Date.parse(str)), { message: 'Invalid date format' })
    .transform((str) => new Date(str)),
  location: z.preprocess(
    (val) => (val === '' ? undefined : val),
    z.string().max(200, 'Location is too long').optional().transform((val) => val ? sanitizeString(val) : val)
  ),
  notes: z.preprocess(
    (val) => (val === '' ? undefined : val),
    z.string().max(500, 'Notes are too long').optional().transform((val) => val ? sanitizeString(val) : val)
  ),
});

// Route params validation
export const kodeBookingParamsSchema = z.object({
  kodeBooking: z.string().trim().min(1, 'Booking code is required'),
});

// Token schema matches the format used in public/portal gallery routes:
// accepts CUID or any string between 10-50 chars. .trim() normalizes
// leading/trailing whitespace before the CUID/length checks.
const galleryTokenField = z.string().trim().cuid().or(z.string().trim().min(10).max(50));

export const tokenParamsSchema = z.object({
  token: galleryTokenField,
});

export const photoIdParamsSchema = z.object({
  photoId: z.string().trim().min(1, 'Photo ID is required'),
});

// Compose from base schemas to avoid duplication
export const tokenPhotoParamsSchema = tokenParamsSchema.merge(photoIdParamsSchema);

// Query params validation — clientId scopes reconciliation to a single client.
// Unknown keys are stripped (default Zod behavior) so future query params
// can be added without breaking this schema.
export const clientReconcileQuerySchema = z.object({
  clientId: z.string().trim().min(1, 'Client ID must be non-empty when provided').optional(),
});

export const selectionSubmitSchema = z.object({
  photoIds: z.array(z.string()).min(1, 'Select at least 1 photo'),
});

export const paymentProofSchema = z.object({
  eventId: z.string().min(1, 'Event ID is required'),
  paymentId: z.string().min(1, 'Payment ID is required'),
  uploadId: z.string().min(1, 'Upload ID is required'),
});

export const updateGallerySchema = z.object({
  namaProject: z.string()
    .min(1, 'Project name cannot be empty')
    .max(100, 'Project name is too long')
    .optional()
    .transform((val) => val ? sanitizeString(val) : val),
  maxSelection: z.number().int().min(0).optional(),
  status: z.enum(['draft', 'published', 'archived']).optional(),
  enableDownload: z.boolean().optional(),
  welcomeMessage: z.string()
    .max(500, 'Message is too long')
    .nullable()
    .optional()
    .transform((val) => val ? sanitizeString(val) : val),
  thankYouMessage: z.string()
    .max(500, 'Message is too long')
    .nullable()
    .optional()
    .transform((val) => val ? sanitizeString(val) : val),
  bannerClientName: z.string()
    .max(100, 'Name is too long')
    .nullable()
    .optional()
    .transform((val) => val ? sanitizeString(val) : val),
  bannerEventDate: z.string()
    .max(100, 'Date is too long')
    .nullable()
    .optional()
    .transform((val) => val ? sanitizeString(val) : val),
});

// Partial schemas for PATCH endpoints (all fields optional)
export const eventUpdateSchema = eventSchema.partial();
export const clientUpdateSchema = clientSchema.partial();
export const packageUpdateSchema = packageSchema.partial();

// Helper function to validate and return error response.
//
// We accept any Zod schema (`z.ZodTypeAny`) and use `z.output<S>` for the
// returned data type. The previous `z.ZodSchema<T>` signature inferred T
// poorly when callers passed schemas that have transforms / partial /
// preprocessors (the inference latched on to the *input* shape rather
// than the parsed output). That mismatch is what forced earlier callers
// to slap `@ts-expect-error` on top of `validateRequest(eventUpdateSchema, body)`.
// With this signature, `dataValidation.data` is correctly typed as the
// transformed output without any cast.
export function validateRequest<S extends z.ZodTypeAny>(
  schema: S,
  data: unknown
): { success: true; data: z.output<S> } | { success: false; error: string } {
  const result = schema.safeParse(data);
  if (!result.success) {
    const firstError = result.error.errors[0];
    return {
      success: false,
      error: firstError.path.length > 0
        ? `${firstError.path.join('.')}: ${firstError.message}`
        : firstError.message,
    };
  }
  return { success: true, data: result.data };
}

/**
 * Extract the first Zod error as a human-readable string.
 * Includes the field path when present: "email: Invalid email"
 * Returns a generic message if the errors array is unexpectedly empty.
 */
export function formatZodError(error: z.ZodError): string {
  if (error.errors.length === 0) return 'Validation failed';
  const firstError = error.errors[0];
  return firstError.path.length > 0
    ? `${firstError.path.join('.')}: ${firstError.message}`
    : firstError.message;
}

// Normalize empty string / null / undefined → undefined so Zod optional()
// defaults kick in and refine checks don't need to repeat the same triple guard.
const emptyToUndefined = <T>(val: T) =>
  val === null || val === undefined || val === '' ? undefined : val;

/**
 * Portal-safe profile update schema.
 * Subset of clientSchema — excludes email, password, storageQuotaGB, isApproved
 * so clients cannot escalate their own privileges via PATCH /api/portal/profile.
 */
export const portalProfileUpdateSchema = z.object({
  // Transform first, then refine — so a spaces-only name ("   ") is caught
  // after sanitizeString trims it to "" rather than passing the .min(1) check.
  nama: z.string()
    .max(255, 'Name is too long')
    .optional()
    .transform((val) => val ? sanitizeString(val) : val)
    .refine((val) => val === undefined || val.length > 0, {
      message: 'Name is required',
    }),
  phone: z.preprocess(
    emptyToUndefined,
    z.string()
      .max(20, 'Phone is too long')
      .refine((val) => phoneRegex.test(val), {
        message: 'Invalid phone number format (use 08xx or +62)',
      })
      .optional()
      .nullable()
  ),
  instagram: z.preprocess(
    emptyToUndefined,
    z.string()
      .max(100, 'Instagram is too long')
      .refine((val) => /^@?[a-zA-Z0-9._]{1,30}$/.test(val), {
        message: 'Invalid Instagram format',
      })
      .optional()
      .nullable()
  ),
});