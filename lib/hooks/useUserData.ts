'use client';

import { useQuery } from '@tanstack/react-query';

import { calculateBackoff } from './queryHelpers';
import { UserDataPayload } from '../types/user';

export const REFRESH_INTERVAL_MS = 60_000;
const ERROR_INTERVAL_MAX_MS = 120_000;

async function fetchUserData(address: string): Promise<UserDataPayload> {
  const res = await fetch(`/api/users/${address}`, {
    cache: 'no-store',
  });

  if (!res.ok) {
    throw new Error(`User data fetch failed: ${res.status}`);
  }

  return (await res.json()) as UserDataPayload;
}

export function useUserData(address: string, initialData?: UserDataPayload) {
  const query = useQuery({
    queryKey: ['user', address],
    queryFn: () => fetchUserData(address),
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

  return {
    data: query.data,
    isLoading: query.isLoading,
    error: query.error,
    isFetching: query.isFetching,
    refetch: query.refetch,
  };
}
