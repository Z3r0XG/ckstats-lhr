'use client';

import { useEffect } from 'react';

import { useQuery } from '@tanstack/react-query';

import { DashboardPayload } from '../types/dashboard';

export const REFRESH_INTERVAL_MS = 60_000;
const ERROR_INTERVAL_MAX_MS = 120_000;

async function fetchDashboard(): Promise<DashboardPayload> {
  // Check for debug_error query param to simulate errors
  const params = new URLSearchParams(window.location.search);
  const debugError = params.get('debug_error');

  const url =
    debugError === 'true'
      ? '/api/dashboard?debug_error=true'
      : '/api/dashboard';

  const res = await fetch(url, {
    cache: 'no-store',
  });

  if (!res.ok) {
    throw new Error(`Dashboard fetch failed: ${res.status}`);
  }

  return (await res.json()) as DashboardPayload;
}

function isDataStale(data: DashboardPayload | undefined): boolean {
  if (!data?.generatedAt) return true;
  const ageMs = Date.now() - new Date(data.generatedAt).getTime();
  return ageMs > REFRESH_INTERVAL_MS * 2;
}

export function useDashboardData(initialData?: DashboardPayload) {
  const query = useQuery({
    queryKey: ['dashboard'],
    queryFn: fetchDashboard,
    initialData,
    staleTime: 0,
    refetchOnMount: true,
    refetchInterval: (query) => {
      if (query.state.status === 'error') {
        const attempts = Math.max(1, (query.state.fetchFailureCount ?? 0) + 1);
        const backoff = Math.min(
          ERROR_INTERVAL_MAX_MS,
          REFRESH_INTERVAL_MS * 2 ** (attempts - 1)
        );
        return backoff;
      }

      return REFRESH_INTERVAL_MS;
    },
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
  });

  // Refetch immediately on mount if initial data is stale
  useEffect(() => {
    if (isDataStale(initialData)) {
      void query.refetch();
    }
    // Only check on mount, not when dependencies change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    data: query.data,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    dataUpdatedAt: query.dataUpdatedAt,
    error: query.error as Error | null,
    refetch: query.refetch,
  };
}
