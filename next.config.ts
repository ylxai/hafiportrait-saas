import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
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
    // `Document-Policy: js-profiling` must be set in every environment so that
    // Sentry's browser profiling integration can start. Strict CSP / HSTS only
    // applied in production to avoid breaking local dev tooling.
    const documentPolicy = {
      source: '/:path*',
      headers: [
        {
          key: 'Document-Policy',
          value: 'js-profiling',
        },
      ],
    };

    if (process.env.NODE_ENV !== 'production') {
      return [documentPolicy];
    }

    return [
      documentPolicy,
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

export default withSentryConfig(nextConfig, {
  // Suppresses source map upload logs during build.
  silent: !process.env.CI,
  // Org/project resolved from env (configure in Vercel):
  //   SENTRY_ORG, SENTRY_PROJECT, SENTRY_AUTH_TOKEN
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  // Upload a larger set of source maps for prettier stack traces (increases build time).
  widenClientFileUpload: true,
  // Route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
  tunnelRoute: '/monitoring',
  // Disable Sentry telemetry.
  telemetry: false,
  // Automatically tree-shake Sentry logger statements to reduce bundle size.
  disableLogger: true,
});
