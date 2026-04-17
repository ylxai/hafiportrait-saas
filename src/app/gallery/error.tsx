'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { AlertCircle, Home } from 'lucide-react';

export default function GalleryError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Gallery error boundary caught:', error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="flex justify-center">
          <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
            <AlertCircle className="w-8 h-8 text-destructive" />
          </div>
        </div>
        
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-foreground">
            Galeri Tidak Dapat Dimuat
          </h1>
          <p className="text-muted-foreground">
            Maaf, terjadi kesalahan saat memuat galeri. Silakan coba lagi atau hubungi fotografer Anda.
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
            <Home className="w-4 h-4 mr-2" />
            Beranda
          </Button>
        </div>
      </div>
    </div>
  );
}
