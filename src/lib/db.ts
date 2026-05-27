import { PrismaClient } from '@/generated/prisma';
import { withAccelerate } from '@prisma/extension-accelerate';

/**
 * Prisma client singleton with Prisma Accelerate.
 *
 * Accelerate provides:
 * - Connection pooling (solves Vercel serverless connection exhaustion)
 * - Query caching (reduces DB load on read-heavy endpoints)
 * - Edge-compatible (no binary engine needed — postinstall uses --no-engine)
 *
 * DATABASE_URL must be set to the Prisma Accelerate URL:
 *   prisma+postgres://accelerate.prisma-data.net/?api_key=...
 *
 * For schema migrations (db push/migrate), use DIRECT_URL with the
 * Neon direct connection string (prisma:// does not support DDL).
 *
 * The `globalForPrisma` singleton pattern prevents HMR in development
 * from spawning a fresh client on every reload.
 */
const globalForPrisma = globalThis as unknown as {
  prisma: ReturnType<typeof makePrismaClient> | undefined;
};

function makePrismaClient() {
  return new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  }).$extends(withAccelerate());
}

export const prisma = globalForPrisma.prisma ?? makePrismaClient();

/** Stable type alias for the Accelerate-extended Prisma client. */
export type ExtendedPrismaClient = typeof prisma;

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
