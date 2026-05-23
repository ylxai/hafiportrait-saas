import 'server-only';
import { z } from 'zod';
import { publicEnvSchema } from './env.shared';

/**
 * Server-only environment variables.
 *
 * Marked with the `server-only` package, which causes Next.js to throw at
 * BUILD TIME if this module is imported into a client component. This is
 * stronger than a runtime `typeof window` check because it catches mistakes
 * before they ship.
 *
 * Public (`NEXT_PUBLIC_*`) variables are inherited from `env.shared.ts` so
 * the browser and server validate them identically.
 *
 * Use `@/lib/env.client` for browser-safe variables.
 */

const serverEnvSchema = publicEnvSchema.extend({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  NEXTAUTH_SECRET: z.string().min(1, 'NEXTAUTH_SECRET is required'),
  NEXTAUTH_URL: z.string().url().default('http://localhost:3000'),

  // Cloudinary (thumbnails)
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),

  // Cloudflare R2 (original files)
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY: z.string().optional(),
  R2_SECRET_KEY: z.string().optional(),
  R2_BUCKET_NAME: z.string().optional(),
  R2_PUBLIC_URL: z.string().optional(),
  R2_ENDPOINT: z.string().optional(),

  // Ably Real-time (server-side key only)
  ABLY_API_KEY: z.string().optional(),

  // Webhook
  VPS_WEBHOOK_SECRET: z.string().optional(),

  // Cloudflare Queue / Worker
  // Project deploys to Vercel only — there is no local Wrangler CLI in the
  // runtime path, so the generic CLOUDFLARE_* names cannot conflict with
  // Wrangler's own env lookup. NEXT_SERVER_CF_QUEUE_TOKEN keeps its existing
  // prefix because that's the name already provisioned in Vercel.
  CLOUDFLARE_ACCOUNT_ID: z.string().optional(),
  NEXT_SERVER_CF_QUEUE_TOKEN: z.string().optional(),
  CLOUDFLARE_WORKER_URL: z
    .string()
    .url()
    .default('https://photostudio-deletion-worker.masipah1973.workers.dev'),
});

const parsed = serverEnvSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('[env.server] Invalid environment variables:', parsed.error.flatten().fieldErrors);
  throw new Error('[env.server] Invalid environment configuration');
}

export const env = parsed.data;

export type ServerEnv = z.infer<typeof serverEnvSchema>;
