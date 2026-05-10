'use client';

import { SessionProvider } from 'next-auth/react';
import { SWRConfig } from 'swr';
import { Toaster } from '@/components/ui/sonner';

const fetcher = async (url: string): Promise<unknown> => {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
  }
  return res.json() as unknown;
};

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <SWRConfig
        value={{
          fetcher,
          revalidateOnFocus: false,
          revalidateOnReconnect: true,
          dedupingInterval: 5000,
          errorRetryInterval: 5000,
          focusThrottleInterval: 5000,
        }}
      >
        {children}
        {/* Global toast notifications. Mounted once at the root so any
            client component can call `toast.success/error/...` from sonner
            and have them rendered (previously this was missing, so toasts
            silently no-op'd everywhere). */}
        <Toaster richColors closeButton position="top-right" />
      </SWRConfig>
    </SessionProvider>
  );
}