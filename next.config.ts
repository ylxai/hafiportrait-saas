import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Prisma engine lives in the custom generator output dir
  // (`src/generated/prisma`), which Next.js' default outputFileTracing
  // doesn't pick up. Force-include the platform `.so.node` binaries plus
  // the schema so Vercel's serverless bundles can load Prisma at runtime.
  outputFileTracingIncludes: {
    '/**/*': [
      './src/generated/prisma/libquery_engine-*.so.node',
      './src/generated/prisma/schema.prisma',
    ],
  },
  // Avoid bundling Prisma client into the serverless function — keep it
  // resolved from the file-system tracing include above.
  serverExternalPackages: ['@prisma/client', '.prisma/client'],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'res.cloudinary.com',
      },
      {
        protocol: 'https',
        hostname: '*.r2.cloudflarestorage.com',
      },
      {
        protocol: 'https',
        hostname: '*.r2.dev',
      },
    ],
    dangerouslyAllowSVG: false,
  },
  async headers() {
    // Only apply strict CSP in production
    if (process.env.NODE_ENV !== 'production') {
      return [];
    }

    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'on'
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload'
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY'
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff'
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block'
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin'
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()'
          },
          {
            key: 'Content-Security-Policy',
            // Next.js requires 'unsafe-eval' for dynamic imports and 'unsafe-inline' for React hydration
            // For stricter CSP, implement nonce-based approach with middleware
            value: "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https: blob:; font-src 'self' data:; connect-src 'self' https: wss:; worker-src 'self' blob:; frame-ancestors 'none';"
          }
        ],
      },
    ];
  },
};

export default nextConfig;
