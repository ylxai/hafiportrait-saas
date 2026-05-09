// Sentry browser-side initialization (Next.js 15.3+ replaces sentry.client.config.ts).
// Browser profiling requires the `Document-Policy: js-profiling` response header
// (configured in `next.config.ts`).
import * as Sentry from '@sentry/nextjs';

const isProd = process.env.NEXT_PUBLIC_VERCEL_ENV === 'production';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,
  release: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA,
  integrations: [
    Sentry.browserTracingIntegration(),
    Sentry.browserProfilingIntegration(),
  ],
  // Tracing
  tracesSampleRate: isProd ? 0.1 : 1.0,
  // Distributed tracing only on our own origins.
  tracePropagationTargets: [
    'localhost',
    /^\/(?:api|portal|admin|gallery)\//,
  ],
  // Decision evaluated once per session.
  profilesSampleRate: isProd ? 0.1 : 1.0,
  profileSessionSampleRate: isProd ? 0.1 : 1.0,
  sendDefaultPii: false,
});

// Required by `@sentry/nextjs` to capture client-side router transitions.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
