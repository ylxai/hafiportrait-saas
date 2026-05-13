'use client';

import { useEffect } from 'react';
import { logger } from '@/lib/logger';

/**
 * Global error boundary.
 *
 * Next.js 15 requires `global-error.tsx` to render its own `<html>` and
 * `<body>` because it *replaces* the root layout (`app/layout.tsx`) when
 * a root-level error escapes every other boundary. Without these tags
 * React would warn (`Hydration mismatch: cannot render <div> as the
 * root of <html>`) and the rendered tree would be invalid HTML — which
 * also prevents the error from being announced correctly by screen
 * readers.
 *
 * See: https://nextjs.org/docs/app/api-reference/file-conventions/error#global-error
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Structured logger replaces ad-hoc `console.error` so production
    // observability gets the same shape (level/event/time/digest) as the
    // rest of the app. The handler runs once per render thanks to
    // `error` reference identity in the dep array.
    //
    // Review #72-3 (Gemini): match the `error.boundary.{root,admin,gallery}`
    // naming used by the sibling error boundaries so log filters can
    // pivot on a single common prefix.
    logger.error('error.boundary.global', {
      error,
      digest: error.digest,
    });
  }, [error]);

  return (
    // Review #72-2 (Gemini): `app/layout.tsx` puts the `dark` class on
    // `<html>` so the OKLCH semantic tokens defined in
    // `src/app/globals.css` resolve to the Aura Noir palette. Because
    // Next.js *replaces* the root layout when this boundary fires, we
    // have to repeat that class here — otherwise CSS variables fall
    // back to their light defaults and the error screen renders in
    // an off-brand colour scheme that's also harder to read against
    // the dark `bg-background` we set on `<body>`.
    <html lang="id" className="dark">
      <body className="bg-background text-foreground antialiased">
        {/*
          `role="alert"` + `aria-live="assertive"` make screen readers
          announce the failure immediately when the boundary mounts —
          critical because the user just lost the page they were on.
        */}
        <div
          role="alert"
          aria-live="assertive"
          aria-atomic="true"
          className="min-h-screen flex items-center justify-center bg-background px-4"
        >
          <div className="text-center max-w-md">
            {/* Decorative icon container — the message text below is the
                accessible name; hide the emoji from assistive tech. */}
            <div
              aria-hidden="true"
              className="w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center mx-auto mb-4"
            >
              <span className="text-2xl">⚠️</span>
            </div>
            {/* Use h1 because this fragment renders the entire document
                (root layout is replaced). */}
            <h1 className="text-xl font-bold text-foreground mb-2">
              Terjadi Kesalahan
            </h1>
            <p className="text-muted-foreground mb-6">
              Mohon maaf, terjadi kesalahan yang tidak terduga.
            </p>
            {error.digest && (
              <p className="text-xs text-muted-foreground/70 mb-4 font-mono">
                Error ID: {error.digest}
              </p>
            )}
            <button
              type="button"
              onClick={reset}
              className="px-6 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background"
            >
              Coba Lagi
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}