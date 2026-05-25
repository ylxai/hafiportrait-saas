'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { AlertCircle } from 'lucide-react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log to console for client-side error tracking. Using console.error
    // instead of the structured logger because logger depends on
    // node:async_hooks which cannot be imported in client components.
    console.error('error.boundary.root', {
      error,
      digest: error.digest,
    });
  }, [error]);

  return (
    // `role="alert"` + `aria-live="assertive"` ensure screen readers
    // announce the failure as soon as the boundary mounts — without
    // them the heading is just a heading and the user may miss it.
    <div
      role="alert"
      aria-live="assertive"
      aria-atomic="true"
      className="min-h-screen flex items-center justify-center bg-background p-4"
    >
      <div className="max-w-md w-full text-center space-y-6">
        <div className="flex justify-center">
          {/* Decorative — visible h1 below is the accessible name. */}
          <div
            aria-hidden="true"
            className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center"
          >
            <AlertCircle className="w-8 h-8 text-destructive" />
          </div>
        </div>
        
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-foreground">
            Terjadi Kesalahan
          </h1>
          <p className="text-muted-foreground">
            Maaf, terjadi kesalahan yang tidak terduga. Tim kami telah diberitahu dan sedang menangani masalah ini.
          </p>
        </div>

        {process.env.NODE_ENV === 'development' && (
          <div className="p-4 bg-destructive/5 border border-destructive/20 rounded-lg text-left">
            <p className="text-sm font-mono text-destructive break-all">
              {error.message}
            </p>
            {error.digest && (
              <p className="text-xs text-destructive/80 mt-2">
                Error ID: {error.digest}
              </p>
            )}
          </div>
        )}

        <div className="flex gap-3 justify-center">
          <Button
            onClick={reset}
            className="bg-primary hover:bg-primary/90"
          >
            Coba Lagi
          </Button>
          <Button
            variant="outline"
            onClick={() => window.location.href = '/'}
          >
            Kembali ke Beranda
          </Button>
        </div>
      </div>
    </div>
  );
}
