'use client';

import { useEffect, type ReactNode } from 'react';

import Link from 'next/link';

import PoolStatsChart from './PoolStatsChart';
import PoolStatsDisplay from './PoolStatsDisplay';
import { useRefresh } from '../lib/contexts/RefreshContext';
import { useDashboardData } from '../lib/hooks/useDashboardData';
import { DashboardPayload } from '../lib/types/dashboard';
import {
  formatConciseTimeAgo,
  formatHashrate,
  formatNumber,
} from '../utils/helpers';
import { isVisible, anyVisible } from '../utils/visibility';

// On mobile (<sm) the leaderboard tables render as self-contained cards instead of a horizontally
// scrolling table: a hero header (identity left + #rank right) over label-left / value-right stat
// rows (see KvRow), matching each table's desktop column order. The <table> is kept for sm+.

// One label-left / value-right stat row inside a mobile card.
function KvRow({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: ReactNode;
  valueClass?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2 text-sm">
      <span className="shrink-0 text-base-content/60">{label}</span>
      <span className={`min-w-0 break-words text-right ${valueClass ?? ''}`}>
        {value}
      </span>
    </div>
  );
}

export default function DashboardClient({
  initialData,
}: {
  initialData: DashboardPayload;
}) {
  const { data, isLoading, error, refetch } = useDashboardData(initialData);
  const { registerRefresh, unregisterRefresh } = useRefresh();

  useEffect(() => {
    registerRefresh(() => void refetch());
    return () => unregisterRefresh();
  }, [registerRefresh, unregisterRefresh, refetch]);

  // Show loading only on initial load when we have no data
  if (isLoading && !data) {
    return <div className="p-4">Loading dashboard...</div>;
  }

  // If we have no data at all (should be rare with SSR), show error
  if (!data) {
    return (
      <div className="p-4 text-red-600">
        {error
          ? `Error loading dashboard: ${error.message}`
          : 'No dashboard data available.'}
      </div>
    );
  }

  // Convert timestamps to Date for PoolStatsDisplay and PoolStatsChart
  const convertStats = (stat) => ({
    ...stat,
    timestamp: stat.timestamp ? new Date(stat.timestamp) : stat.timestamp,
  });
  const stats = data.latestStats ? convertStats(data.latestStats) : undefined;
  const historicalStats = Array.isArray(data.historicalStats)
    ? data.historicalStats.map(convertStats)
    : [];

  return (
    <main className="container mx-auto p-4">
      <PoolStatsDisplay
        stats={stats}
        historicalStats={historicalStats}
        generatedAt={data.generatedAt ? new Date(data.generatedAt) : undefined}
        service={data.service}
      />
      {isVisible('dashboard.chart') &&
        (historicalStats && historicalStats.length > 0 ? (
          <PoolStatsChart data={historicalStats} />
        ) : (
          <p>Historical data is not available.</p>
        ))}
      {anyVisible([
        'dashboard.leaderboard.difficulties',
        'dashboard.leaderboard.hashrates',
        'dashboard.leaderboard.loyalty',
      ]) && (
        <div className="flex flex-wrap gap-4 mt-8">
          {/* Top 10 Difficulties */}
          {isVisible('dashboard.leaderboard.difficulties') && (
            <div className="card bg-base-100 shadow-xl card-compact sm:card-normal flex-1 min-w-[320px] max-w-full">
              <div className="card-body">
                <h2 className="card-title">
                  <Link href="/top-difficulties" className="link text-primary">
                    Top 10 User Difficulties Ever
                  </Link>
                </h2>
                <div className="overflow-x-auto hidden sm:block">
                  <table className="table w-full table-sm sm:table-md">
                    <thead>
                      <tr>
                        <th>Rank</th>
                        <th>Address</th>
                        <th>Best Diff</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(data.topUserDifficulties ?? []).length === 0 ? (
                        <tr>
                          <td
                            colSpan={3}
                            className="text-center text-sm text-base-content/60"
                          >
                            No Stats Available Yet
                          </td>
                        </tr>
                      ) : (
                        (data.topUserDifficulties ?? [])
                          .slice(0, 10)
                          .map((user, index) => (
                            <tr key={user.address}>
                              <td>{index + 1}</td>
                              <td>{user.address}</td>
                              <td className="text-accent whitespace-nowrap">
                                {formatNumber(Number(user.difficulty))}
                              </td>
                            </tr>
                          ))
                      )}
                    </tbody>
                  </table>
                </div>
                <ul className="sm:hidden space-y-2">
                  {(data.topUserDifficulties ?? []).length === 0 ? (
                    <li className="text-center text-sm text-base-content/60">
                      No Stats Available Yet
                    </li>
                  ) : (
                    (data.topUserDifficulties ?? [])
                      .slice(0, 10)
                      .map((user, index) => (
                        <li
                          key={user.address}
                          className="rounded-box border border-base-300 bg-base-200/50 p-3 space-y-1.5"
                        >
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="min-w-0 truncate text-base font-semibold">
                              {user.address}
                            </span>
                            <span className="shrink-0 text-sm text-base-content/50">
                              #{index + 1}
                            </span>
                          </div>
                          <KvRow
                            label="best diff"
                            value={formatNumber(Number(user.difficulty))}
                            valueClass="text-accent font-semibold"
                          />
                        </li>
                      ))
                  )}
                </ul>
              </div>
            </div>
          )}

          {/* Top 10 Hashrates */}
          {isVisible('dashboard.leaderboard.hashrates') && (
            <div className="card bg-base-100 shadow-xl card-compact sm:card-normal flex-1 min-w-[320px] max-w-full">
              <div className="card-body">
                <h2 className="card-title">
                  <Link href="/top-hashrates" className="link text-primary">
                    Top 10 Active User Hashrates
                  </Link>
                </h2>
                <div className="overflow-x-auto hidden sm:block">
                  <table className="table w-full table-sm sm:table-md">
                    <thead>
                      <tr>
                        <th>Rank</th>
                        <th>Address</th>
                        <th>Hashrate</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(data.topUserHashrates ?? []).length === 0 ? (
                        <tr>
                          <td
                            colSpan={3}
                            className="text-center text-sm text-base-content/60"
                          >
                            No Stats Available Yet
                          </td>
                        </tr>
                      ) : (
                        (data.topUserHashrates ?? [])
                          .slice(0, 10)
                          .map((user, index) => (
                            <tr key={user.address}>
                              <td>{index + 1}</td>
                              <td>{user.address}</td>
                              <td className="text-accent whitespace-nowrap">
                                {formatHashrate(user.hashrate1hr)}
                              </td>
                            </tr>
                          ))
                      )}
                    </tbody>
                  </table>
                </div>
                <ul className="sm:hidden space-y-2">
                  {(data.topUserHashrates ?? []).length === 0 ? (
                    <li className="text-center text-sm text-base-content/60">
                      No Stats Available Yet
                    </li>
                  ) : (
                    (data.topUserHashrates ?? [])
                      .slice(0, 10)
                      .map((user, index) => (
                        <li
                          key={user.address}
                          className="rounded-box border border-base-300 bg-base-200/50 p-3 space-y-1.5"
                        >
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="min-w-0 truncate text-base font-semibold">
                              {user.address}
                            </span>
                            <span className="shrink-0 text-sm text-base-content/50">
                              #{index + 1}
                            </span>
                          </div>
                          <KvRow
                            label="hashrate"
                            value={formatHashrate(user.hashrate1hr)}
                            valueClass="text-accent font-semibold"
                          />
                        </li>
                      ))
                  )}
                </ul>
              </div>
            </div>
          )}

          {/* Top 10 Loyalty */}
          {isVisible('dashboard.leaderboard.loyalty') && (
            <div className="card bg-base-100 shadow-xl card-compact sm:card-normal flex-1 min-w-[320px] max-w-full">
              <div className="card-body">
                <h2 className="card-title">
                  <Link href="/top-loyalty" className="link text-primary">
                    Top 10 Longest Active Users
                  </Link>
                </h2>
                <div className="overflow-x-auto hidden sm:block">
                  <table className="table w-full table-sm sm:table-md">
                    <thead>
                      <tr>
                        <th>Rank</th>
                        <th>Address</th>
                        <th>When</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(data.topUserLoyalty ?? []).length === 0 ? (
                        <tr>
                          <td
                            colSpan={3}
                            className="text-center text-sm text-base-content/60"
                          >
                            No Stats Available Yet
                          </td>
                        </tr>
                      ) : (
                        (data.topUserLoyalty ?? [])
                          .slice(0, 10)
                          .map((user, index) => {
                            const when = user.authorised
                              ? new Date(Number(user.authorised) * 1000)
                              : null;
                            return (
                              <tr key={user.address}>
                                <td>{index + 1}</td>
                                <td>{user.address}</td>
                                <td className="text-accent whitespace-nowrap">
                                  {when ? formatConciseTimeAgo(when) : '-'}
                                </td>
                              </tr>
                            );
                          })
                      )}
                    </tbody>
                  </table>
                </div>
                <ul className="sm:hidden space-y-2">
                  {(data.topUserLoyalty ?? []).length === 0 ? (
                    <li className="text-center text-sm text-base-content/60">
                      No Stats Available Yet
                    </li>
                  ) : (
                    (data.topUserLoyalty ?? [])
                      .slice(0, 10)
                      .map((user, index) => {
                        const when = user.authorised
                          ? new Date(Number(user.authorised) * 1000)
                          : null;
                        return (
                          <li
                            key={user.address}
                            className="rounded-box border border-base-300 bg-base-200/50 p-3 space-y-1.5"
                          >
                            <div className="flex items-baseline justify-between gap-2">
                              <span className="min-w-0 truncate text-base font-semibold">
                                {user.address}
                              </span>
                              <span className="shrink-0 text-sm text-base-content/50">
                                #{index + 1}
                              </span>
                            </div>
                            <KvRow
                              label="when"
                              value={when ? formatConciseTimeAgo(when) : '-'}
                              valueClass="text-accent font-semibold"
                            />
                          </li>
                        );
                      })
                  )}
                </ul>
              </div>
            </div>
          )}
        </div>
      )}

      {isVisible('dashboard.highscores') && (
        <div className="mt-8">
          <div className="card bg-base-100 shadow-xl card-compact sm:card-normal">
            <div className="card-body">
              <h2 className="card-title">High Scores</h2>
              <div className="overflow-x-auto hidden sm:block">
                <table className="table w-full table-sm sm:table-md">
                  <thead>
                    <tr>
                      <th>Rank</th>
                      <th>Client</th>
                      <th>Difficulty</th>
                      <th>When</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data.highScores ?? []).length === 0 ? (
                      <tr>
                        <td
                          colSpan={4}
                          className="text-center text-sm text-base-content/60"
                        >
                          No high scores yet
                        </td>
                      </tr>
                    ) : (
                      (data.highScores ?? []).slice(0, 10).map((score) => (
                        <tr
                          key={`${score.rank}-${score.device}-${score.timestamp}`}
                        >
                          <td>{score.rank}</td>
                          <td className="whitespace-nowrap">{score.device}</td>
                          <td className="text-accent whitespace-nowrap">
                            {formatNumber(score.difficulty)}
                          </td>
                          <td className="text-accent whitespace-nowrap">
                            {formatConciseTimeAgo(new Date(score.timestamp))}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              {/* Mobile: each row as a self-contained card (no horizontal scroll) */}
              <ul className="sm:hidden space-y-2">
                {(data.highScores ?? []).length === 0 ? (
                  <li className="text-center text-sm text-base-content/60">
                    No high scores yet
                  </li>
                ) : (
                  (data.highScores ?? []).slice(0, 10).map((score) => (
                    <li
                      key={`m-${score.rank}-${score.device}-${score.timestamp}`}
                      className="rounded-box border border-base-300 bg-base-200/50 p-3 space-y-1.5"
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="min-w-0 truncate text-base font-semibold">
                          {score.device}
                        </span>
                        <span className="shrink-0 text-sm text-base-content/50">
                          #{score.rank}
                        </span>
                      </div>
                      <KvRow
                        label="difficulty"
                        value={formatNumber(score.difficulty)}
                        valueClass="text-accent font-semibold"
                      />
                      <KvRow
                        label="when"
                        value={formatConciseTimeAgo(new Date(score.timestamp))}
                        valueClass="text-accent font-semibold"
                      />
                    </li>
                  ))
                )}
              </ul>
            </div>
          </div>
        </div>
      )}

      {isVisible('dashboard.online_devices') && (
        <div className="mt-4">
          <div className="card bg-base-100 shadow-xl card-compact sm:card-normal">
            <div className="card-body">
              <h2 className="card-title">Online Devices</h2>
              <div className="overflow-x-auto hidden sm:block">
                <table className="table w-full table-sm sm:table-md">
                  <thead>
                    <tr>
                      <th>Rank</th>
                      <th>Client</th>
                      <th>Active</th>
                      <th>Hashrate</th>
                      <th>Best Diff</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data.onlineDevices ?? []).length === 0 ? (
                      <tr>
                        <td
                          colSpan={5}
                          className="text-center text-sm text-base-content/60"
                        >
                          No devices online
                        </td>
                      </tr>
                    ) : (
                      (data.onlineDevices ?? []).map((device, index) => (
                        <tr key={device.client}>
                          <td>{index + 1}</td>
                          <td className="whitespace-nowrap">
                            {device.client || 'Other'}
                          </td>
                          <td className="text-accent whitespace-nowrap">
                            {device.activeWorkers}
                          </td>
                          <td className="text-accent whitespace-nowrap">
                            {formatHashrate(device.hashrate1hr)}
                          </td>
                          <td className="text-accent whitespace-nowrap">
                            {formatNumber(device.bestEver)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <ul className="sm:hidden space-y-2">
                {(data.onlineDevices ?? []).length === 0 ? (
                  <li className="text-center text-sm text-base-content/60">
                    No devices online
                  </li>
                ) : (
                  (data.onlineDevices ?? []).map((device, index) => (
                    <li
                      key={device.client}
                      className="rounded-box border border-base-300 bg-base-200/50 p-3 space-y-1.5"
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="min-w-0 truncate text-base font-semibold">
                          {device.client || 'Other'}
                        </span>
                        <span className="shrink-0 text-sm text-base-content/50">
                          #{index + 1}
                        </span>
                      </div>
                      <KvRow
                        label="active"
                        value={device.activeWorkers}
                        valueClass="text-accent font-semibold"
                      />
                      <KvRow
                        label="hashrate"
                        value={formatHashrate(device.hashrate1hr)}
                        valueClass="text-accent font-semibold"
                      />
                      <KvRow
                        label="best diff"
                        value={formatNumber(device.bestEver)}
                        valueClass="text-accent font-semibold"
                      />
                    </li>
                  ))
                )}
              </ul>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
