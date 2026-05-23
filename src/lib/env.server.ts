import { z } from 'zod';

/**
 * Server-only environment variables.
 * 
 * This module validates ALL environment variables and throws if imported
 * from the browser. Use `@/lib/env.client` for client-safe vars.
 */

if (typeof window !== 'undefined') {
  throw new Error(
    '[env.server] This module cannot be imported from the browser. ' +
    'Use @/lib/env.client for client-safe environment variables.'
  );
}

const serverEnvSchema = z.object({
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

  // Cloudflare Queue
  CLOUDFLARE_ACCOUNT_ID: z.string().optional(),
  NEXT_SERVER_CF_QUEUE_TOKEN: z.string().optional(),
});

const parsed = serverEnvSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('[env.server] Invalid environment variables:', parsed.error.flatten().fieldErrors);
  throw new Error('[env.server] Invalid environment configuration');
}

export const env = parsed.data;

export type ServerEnv = z.infer<typeof serverEnvSchema>;
