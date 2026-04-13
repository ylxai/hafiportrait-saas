'use client';

import { SessionProvider } from 'next-auth/react';
import { SWRConfig } from 'swr';

const fetcher = (url: string) => fetch(url).then(res => res.json());

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