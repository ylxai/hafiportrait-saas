import { PrismaClient } from '@/generated/prisma';

/**
 * Prisma client singleton with documented connection-pool guidance.
 *
 * Sprint 2 Task 2.2: Prisma's default behavior on Vercel serverless
 * opens a fresh DB connection per function instance, which can exhaust
 * Postgres `max_connections` under load. The fix is at the connection
 * STRING layer, not the client constructor — append:
 *
 *   ?connection_limit=5&pool_timeout=10&connect_timeout=10
 *
 * to `DATABASE_URL`. The example in `.env.example` documents this.
 *
 * Future option (deferred): Prisma Accelerate via `@prisma/extension-accelerate`
 * (already in package.json). Wrapping the client with `.$extends(withAccelerate())`
 * would route through Prisma's pooler when `DATABASE_URL` starts with
 * `prisma://`. Skipped for now because the wrapped client surfaces type
 * regressions in our existing transaction callbacks (TS7006). Tracked
 * as a follow-up; the connection-string params above are the
 * documented Sprint 2 Task 2.2 fix and require zero code change.
 *
 * The `globalForPrisma` singleton pattern prevents HMR in development
 * from spawning a fresh client on every reload (would leak connections
 * in `next dev`).
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
});

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
