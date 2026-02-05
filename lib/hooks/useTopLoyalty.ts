'use client';

import { useQuery } from '@tanstack/react-query';

import { calculateBackoff } from './queryHelpers';
import { TopUserLoyalty } from '../types/dashboard';

export const REFRESH_INTERVAL_MS = 60_000;
const ERROR_INTERVAL_MAX_MS = 120_000;

type TopLoyaltyPayload = {
  data: TopUserLoyalty[];
  generatedAt: string;
};

async function fetchTopLoyalty(limit: number): Promise<TopLoyaltyPayload> {
  const res = await fetch(`/api/top-loyalty?limit=${limit}`, {
    cache: 'no-store',
  });

  if (!res.ok) {
    throw new Error(`Top loyalty fetch failed: ${res.status}`);
  }

  return (await res.json()) as TopLoyaltyPayload;
}

export function useTopLoyalty(limit: number, initialData?: TopLoyaltyPayload) {
  return useQuery({
    queryKey: ['top-loyalty', limit],
    queryFn: () => fetchTopLoyalty(limit),
    initialData,
    staleTime: 0,
    refetchOnMount: true,
    refetchInterval: (query) => {
      if (query.state.status === 'error') {
        const attempts = Math.max(1, (query.state.fetchFailureCount ?? 0) + 1);
        return calculateBackoff(
          attempts,
          REFRESH_INTERVAL_MS,
          ERROR_INTERVAL_MAX_MS
        );
      }

      return REFRESH_INTERVAL_MS;
    },
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
  });
}
