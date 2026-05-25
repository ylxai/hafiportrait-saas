/**
 * Prisma error helpers.
 *
 * Centralised guard for Prisma's `PrismaClientKnownRequestError` shape so
 * route handlers don't each re-implement the same `error && typeof error
 * === 'object' && 'code' in error && error.code === 'P2002'` ladder.
 *
 * Usage:
 *   import { isPrismaError } from '@/lib/prisma-error';
 *   if (isPrismaError(error, 'P2002')) { ... }
 */
export function isPrismaError(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === code
  );
}
