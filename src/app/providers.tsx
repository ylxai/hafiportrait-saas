'use client';

import { SessionProvider } from 'next-auth/react';
import { SWRConfig } from 'swr';

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
      </SWRConfig>
    </SessionProvider>
  );
}