import { z } from 'zod';

/**
 * Shared (browser-safe) environment variable schema.
 *
 * Single source of truth for `NEXT_PUBLIC_*` variables that are validated by
 * BOTH the server and client env modules. Keeps validation rules and
 * defaults from drifting between `env.server.ts` and `env.client.ts`.
 *
 * Add a new public variable here and it will be picked up automatically on
 * both sides of the runtime boundary.
 */
export const publicEnvSchema = z.object({
  NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME: z.string().optional(),

  // `.min(1)` guards against empty-string overrides that would produce
  // invalid Ably channel names like `:selections:<id>`.
  NEXT_PUBLIC_ABLY_CHANNEL_PREFIX: z.string().min(1).default('photostudio'),
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;
