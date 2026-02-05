'use client';

import { useEffect } from 'react';

import Link from 'next/link';

import { useRefresh } from '../lib/contexts/RefreshContext';
import { useTopHashrates } from '../lib/hooks/useTopHashrates';
import { TopUserHashrate } from '../lib/types/dashboard';
import { formatHashrate, formatNumber } from '../utils/helpers';

interface TopUserHashratesClientProps {
  initialData: { data: TopUserHashrate[]; generatedAt: string };
  limit: number;
}

const SMALL_LIMIT = 10;

export default function TopUserHashratesClient({
  initialData,
  limit,
}: TopUserHashratesClientProps) {
  const { data, isLoading, error, refetch } = useTopHashrates(
    limit,
    initialData
  );
  const { registerRefresh, unregisterRefresh } = useRefresh();

  useEffect(() => {
    registerRefresh(() => void refetch());
    return () => unregisterRefresh();
  }, [registerRefresh, unregisterRefresh, refetch]);

  if (isLoading && !data) {
    return <div className="p-4">Loading...</div>;
  }

  if (!data) {
    return (
      <div className="card bg-base-100 shadow-xl card-compact sm:card-normal">
        <div className="card-body">
          <h2 className="card-title">Top {limit} User Hashrates</h2>
          <p className="text-error">
            {error
              ? `Error: ${error.message}`
              : 'Error loading top user hashrates. Please try again later.'}
          </p>
        </div>
      </div>
    );
  }

  const hashrates = data.data;

  return (
    <div className="card bg-base-100 shadow-xl card-compact sm:card-normal">
      <div className="card-body">
        <h2 className="card-title">
          {limit > SMALL_LIMIT ? (
            `Top ${limit} Active User Hashrates`
          ) : (
            <Link href="/top-hashrates" className="link text-primary">
              Top {limit} Active User Hashrates
            </Link>
          )}
        </h2>
        <div className="overflow-x-auto">
          <table className="table w-full table-sm sm:table-md">
            <thead>
              <tr>
                <th>Rank</th>
                <th>Address</th>
                {limit > SMALL_LIMIT ? (
                  <>
                    <th>Active Workers</th>
                    <th>Hashrate 1hr</th>
                    <th>Hashrate 1d</th>
                    <th>Hashrate 7d</th>
                    <th>Session Diff</th>
                    <th>Best Diff</th>
                  </>
                ) : (
                  <th>Hashrate</th>
                )}
              </tr>
            </thead>
            <tbody>
              {hashrates.length === 0 ? (
                <tr>
                  <td
                    colSpan={limit > SMALL_LIMIT ? 8 : 3}
                    className="text-center text-sm text-base-content/60"
                  >
                    No Stats Available Yet
                  </td>
                </tr>
              ) : (
                hashrates.map((user, index) => (
                  <tr key={user.address}>
                    <td>{index + 1}</td>
                    <td>{user.address}</td>

                    {limit > SMALL_LIMIT ? (
                      <>
                        <td>{user.workerCount}</td>
                        <td className="text-accent">
                          {formatHashrate(user.hashrate1hr)}
                        </td>
                        <td>{formatHashrate(user.hashrate1d)}</td>
                        <td>{formatHashrate(user.hashrate7d)}</td>
                        <td>{formatNumber(Number(user.bestShare))}</td>
                        <td>{formatNumber(Number(user.bestEver))}</td>
                      </>
                    ) : (
                      <td className="text-accent">
                        {formatHashrate(user.hashrate1hr)}
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
