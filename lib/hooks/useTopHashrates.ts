'use client';

import { useQuery } from '@tanstack/react-query';

import { TopUserHashrate } from '../types/dashboard';

export const REFRESH_INTERVAL_MS = 60_000;

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
    refetchInterval: REFRESH_INTERVAL_MS,
    refetchIntervalInBackground: false,
  });
}
