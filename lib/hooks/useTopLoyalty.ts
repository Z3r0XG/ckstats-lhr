'use client';

import { useQuery } from '@tanstack/react-query';

import { TopUserLoyalty } from '../types/dashboard';

export const REFRESH_INTERVAL_MS = 60_000;

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
    refetchInterval: REFRESH_INTERVAL_MS,
    refetchIntervalInBackground: false,
  });
}
