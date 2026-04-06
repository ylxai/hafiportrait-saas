'use client';

import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Global error:', error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="text-center max-w-md">
        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <span className="text-2xl">⚠️</span>
        </div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">Terjadi Kesalahan</h2>
        <p className="text-gray-600 mb-6">Mohon maaf, terjadi kesalahan yang tidak terduga.</p>
        <button
          onClick={reset}
          className="px-6 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600"
        >
          Coba Lagi
        </button>
      </div>
    </div>
  );
}