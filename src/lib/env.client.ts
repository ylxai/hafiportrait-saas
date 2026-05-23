import { publicEnvSchema, type PublicEnv } from './env.shared';

/**
 * Client-safe environment variables.
 *
 * Re-validates `NEXT_PUBLIC_*` vars on the browser using the shared schema
 * defined in `env.shared.ts`. This guarantees server and client agree on
 * defaults and validation rules.
 *
 * The mapping object is typed as `Record<keyof PublicEnv, string | undefined>`
 * so TypeScript fails the build if a new key is added to `publicEnvSchema`
 * but the client mapping is forgotten.
 *
 * Import this in client components instead of `@/lib/env` or
 * `@/lib/env.server`.
 */

const rawClientEnv: Record<keyof PublicEnv, string | undefined> = {
  NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
  NEXT_PUBLIC_ABLY_CHANNEL_PREFIX: process.env.NEXT_PUBLIC_ABLY_CHANNEL_PREFIX,
};

const parsed = publicEnvSchema.safeParse(rawClientEnv);

if (!parsed.success) {
  console.error('[env.client] Invalid public environment variables:', parsed.error.flatten().fieldErrors);
  throw new Error('[env.client] Invalid public environment configuration');
}

export const clientEnv = parsed.data;

export type { PublicEnv as ClientEnv } from './env.shared';
