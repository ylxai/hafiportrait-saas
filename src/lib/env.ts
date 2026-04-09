import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  NEXTAUTH_SECRET: z.string().min(1, 'NEXTAUTH_SECRET is required'),
  NEXTAUTH_URL: z.string().url().default('http://localhost:3000'),
  
  // Cloudinary (thumbnails)
  NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),
  
  // Cloudflare R2 (original files)
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY: z.string().optional(),
  R2_SECRET_KEY: z.string().optional(),
  R2_BUCKET_NAME: z.string().optional(),
  R2_PUBLIC_URL: z.string().optional(),
  R2_ENDPOINT: z.string().optional(),
  
  // Ably Real-time
  ABLY_API_KEY: z.string().optional(),
  NEXT_PUBLIC_ABLY_API_KEY: z.string().optional(),
  NEXT_PUBLIC_ABLY_CHANNEL_PREFIX: z.string().default('photostudio'),
  
  // Redis/Valkey (for queues and caching)
  REDIS_URL: z.string().optional(),
  REDIS_HOST: z.string().optional(),
  REDIS_PORT: z.string().optional(),
  REDIS_PASSWORD: z.string().optional(),
});

const parsed = typeof window === 'undefined' ? envSchema.safeParse(process.env) : ({ success: true, data: process.env as unknown as z.infer<typeof envSchema> } as z.SafeParseSuccess<z.infer<typeof envSchema>>);

if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors);
  throw new Error('Invalid environment configuration');
}

export const env = parsed.data;