'use client';

import { useEffect, useMemo } from 'react';

import { useQuery } from '@tanstack/react-query';

export type DashboardPayload = {
  version: number;
  generatedAt: string;
  latestStats: any;
  historicalStats: any[];
  topUserHashrates: any[];
  topUserDifficulties: any[];
  onlineDevices: any[];
  highScores: any[];
  limits: {
    topUsers: number;
    onlineDevices: number;
    historicalPoints: number;
  };
};

export const REFRESH_INTERVAL_MS = 60_000;
const ERROR_INTERVAL_MAX_MS = 120_000;

async function fetchDashboard(): Promise<DashboardPayload> {
  const res = await fetch('/api/dashboard', {
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
    staleTime: 10_000,
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
  });

  // Refetch immediately on mount if initial data is stale
  useEffect(() => {
    if (isDataStale(initialData)) {
      void query.refetch();
    }
    // Only check on mount, not when dependencies change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isStale = useMemo(() => {
    if (!query.data?.generatedAt) return false;
    return isDataStale(query.data);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.data?.generatedAt]);

  return {
    data: query.data,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    dataUpdatedAt: query.dataUpdatedAt,
    error: query.error as Error | null,
    isStale,
    refetch: query.refetch,
  };
}
