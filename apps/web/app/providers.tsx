// apps/web/app/providers.tsx
'use client';

import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { ThemeProvider } from './components/ThemeContext';
import { ToastProvider } from './components/Toast';
import { WarehouseProvider } from '../lib/WarehouseContext';

export function Providers({ children }: { children: React.ReactNode }) {
  // useState ensures a new QueryClient is NOT created on every render
  const [queryClient] = useState(
    () => new QueryClient({
      defaultOptions: {
        queries: {
          staleTime:          30_000,
          gcTime:             5 * 60_000,
          refetchOnWindowFocus: true,
          retry:              1,
        },
      },
    })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <ToastProvider>
          <WarehouseProvider>
            {children}
          </WarehouseProvider>
        </ToastProvider>
      </ThemeProvider>
      {process.env.NODE_ENV === 'development' && <ReactQueryDevtools initialIsOpen={false} />}
    </QueryClientProvider>
  );
}
