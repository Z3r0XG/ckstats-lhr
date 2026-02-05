'use client';

import { useQuery } from '@tanstack/react-query';

import { calculateBackoff } from './queryHelpers';
import { TopUserHashrate } from '../types/dashboard';

export const REFRESH_INTERVAL_MS = 60_000;
const ERROR_INTERVAL_MAX_MS = 120_000;

type TopHashratesPayload = {
  data: TopUserHashrate[];
  generatedAt: string;
};

async function fetchTopHashrates(limit: number): Promise<TopHashratesPayload> {
  const res = await fetch(`/api/top-hashrates?limit=${limit}`, {
    cache: 'no-store',
  });

  if (!res.ok) {
    throw new Error(`Top hashrates fetch failed: ${res.status}`);
  }

  return (await res.json()) as TopHashratesPayload;
}

export function useTopHashrates(
  limit: number,
  initialData?: TopHashratesPayload
) {
  return useQuery({
    queryKey: ['top-hashrates', limit],
    queryFn: () => fetchTopHashrates(limit),
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
