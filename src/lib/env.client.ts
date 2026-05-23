import { z } from 'zod';

/**
 * Client-safe environment variables.
 * 
 * Only validates NEXT_PUBLIC_* vars that are safe for browser exposure.
 * Import this in client components instead of @/lib/env or @/lib/env.server.
 */

const clientEnvSchema = z.object({
  NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME: z.string().optional(),
  NEXT_PUBLIC_ABLY_CHANNEL_PREFIX: z.string().default('photostudio'),
});

const parsed = clientEnvSchema.safeParse({
  NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
  NEXT_PUBLIC_ABLY_CHANNEL_PREFIX: process.env.NEXT_PUBLIC_ABLY_CHANNEL_PREFIX,
});

if (!parsed.success) {
  console.error('[env.client] Invalid public environment variables:', parsed.error.flatten().fieldErrors);
  throw new Error('[env.client] Invalid public environment configuration');
}

export const clientEnv = parsed.data;

export type ClientEnv = z.infer<typeof clientEnvSchema>;
