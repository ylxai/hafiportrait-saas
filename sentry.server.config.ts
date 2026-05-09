// Sentry server-side initialization (Node.js runtime).
// Loaded via `instrumentation.ts` -> `register()` for the `nodejs` runtime.
import * as Sentry from '@sentry/nextjs';
import { nodeProfilingIntegration } from '@sentry/profiling-node';

const isProd = process.env.NODE_ENV === 'production';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),
  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
  release: process.env.VERCEL_GIT_COMMIT_SHA,
  integrations: [nodeProfilingIntegration()],
  // Tracing must be enabled for profiling to work.
  tracesSampleRate: isProd ? 0.1 : 1.0,
  // Sample rate decided once per SDK.init call.
  profileSessionSampleRate: isProd ? 0.1 : 1.0,
  // Trace lifecycle automatically enables profiling during active traces.
  profileLifecycle: 'trace',
  sendDefaultPii: false,
});
