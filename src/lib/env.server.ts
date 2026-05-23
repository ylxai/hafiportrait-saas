import 'server-only';
import { z } from 'zod';

/**
 * Server-only environment variables.
 *
 * Marked with the `server-only` package, which causes Next.js to throw at
 * BUILD TIME if this module is imported into a client component. This is
 * stronger than a runtime `typeof window` check because it catches mistakes
 * before they ship.
 *
 * Use `@/lib/env.client` for browser-safe (NEXT_PUBLIC_*) variables.
 */

const serverEnvSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  NEXTAUTH_SECRET: z.string().min(1, 'NEXTAUTH_SECRET is required'),
  NEXTAUTH_URL: z.string().url().default('http://localhost:3000'),

  // Public variables (also needed on the server, mirrored from env.client)
  NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME: z.string().optional(),
  NEXT_PUBLIC_ABLY_CHANNEL_PREFIX: z.string().default('photostudio'),

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

  // Cloudflare Queue
  // NOTE: prefixed with NEXT_SERVER_ to avoid colliding with Wrangler CLI's
  // own CLOUDFLARE_ACCOUNT_ID during local development.
  NEXT_SERVER_CF_ACCOUNT_ID: z.string().optional(),
  NEXT_SERVER_CF_QUEUE_TOKEN: z.string().optional(),
});

const parsed = serverEnvSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('[env.server] Invalid environment variables:', parsed.error.flatten().fieldErrors);
  throw new Error('[env.server] Invalid environment configuration');
}

export const env = parsed.data;

export type ServerEnv = z.infer<typeof serverEnvSchema>;
