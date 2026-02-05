'use client';

import { useQuery } from '@tanstack/react-query';

import { TopUserDifficulty } from '../types/dashboard';

export const REFRESH_INTERVAL_MS = 60_000;

type TopDifficultiesPayload = {
  data: TopUserDifficulty[];
  generatedAt: string;
};

async function fetchTopDifficulties(
  limit: number
): Promise<TopDifficultiesPayload> {
  const res = await fetch(`/api/top-difficulties?limit=${limit}`, {
    cache: 'no-store',
  });

  if (!res.ok) {
    throw new Error(`Top difficulties fetch failed: ${res.status}`);
  }

  return (await res.json()) as TopDifficultiesPayload;
}

export function useTopDifficulties(
  limit: number,
  initialData?: TopDifficultiesPayload
) {
  return useQuery({
    queryKey: ['top-difficulties', limit],
    queryFn: () => fetchTopDifficulties(limit),
    initialData,
    staleTime: 0,
    refetchOnMount: true,
    refetchInterval: REFRESH_INTERVAL_MS,
    refetchIntervalInBackground: false,
  });
}
