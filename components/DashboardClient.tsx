'use client';

import Link from 'next/link';

import PoolStatsChart from './PoolStatsChart';
import PoolStatsDisplay from './PoolStatsDisplay';
import { useDashboardData } from '../lib/hooks/useDashboardData';
import { DashboardPayload } from '../lib/types/dashboard';
import { formatHashrate, formatNumber, formatTimeAgo } from '../utils/helpers';

function formatConciseTimeAgo(date: Date): string {
  const now = Date.now();
  const diffMs = now - date.getTime();
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const week = 7 * day;
  const month = 30 * day;
  const year = 365 * day;

  const formatUnit = (value: number, unit: string) =>
    `${value.toFixed(1)} ${unit}${value !== 1 ? 's' : ''} ago`;

  if (diffMs < minute) return 'Recently';
  if (diffMs >= year) return formatUnit(diffMs / year, 'year');
  if (diffMs >= month) return formatUnit(diffMs / month, 'month');
  if (diffMs >= week) return formatUnit(diffMs / week, 'week');
  if (diffMs >= day) return formatUnit(diffMs / day, 'day');
  if (diffMs >= hour) return formatUnit(diffMs / hour, 'hour');
  return formatUnit(diffMs / minute, 'min');
}

export default function DashboardClient({
  initialData,
}: {
  initialData: DashboardPayload;
}) {
  const { data, isLoading, error, refetch } = useDashboardData(initialData);

  if (isLoading) {
    return <div className="p-4">Loading dashboard...</div>;
  }
  if (error) {
    return (
      <div className="p-4 text-red-600">
        Error loading dashboard: {error.message}
      </div>
    );
  }
  if (!data) {
    return <div className="p-4">No dashboard data available.</div>;
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
        onRefresh={() => void refetch()}
      />
      {historicalStats && historicalStats.length > 0 ? (
        <PoolStatsChart data={historicalStats} />
      ) : (
        <p>Historical data is not available.</p>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-8">
        <div className="card bg-base-100 shadow-xl card-compact sm:card-normal">
          <div className="card-body">
            <h2 className="card-title">
              <Link href="/top-difficulties" className="link text-primary">
                Top 10 User Difficulties Ever
              </Link>
            </h2>
            <div className="overflow-x-auto">
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
                          <td className="text-accent">
                            {formatNumber(Number(user.difficulty))}
                          </td>
                        </tr>
                      ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="card bg-base-100 shadow-xl card-compact sm:card-normal">
          <div className="card-body">
            <h2 className="card-title">
              <Link href="/top-hashrates" className="link text-primary">
                Top 10 Active User Hashrates
              </Link>
            </h2>
            <div className="overflow-x-auto">
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
                          <td className="text-accent">
                            {formatHashrate(user.hashrate1hr)}
                          </td>
                        </tr>
                      ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-8">
        <div className="card bg-base-100 shadow-xl card-compact sm:card-normal">
          <div className="card-body">
            <h2 className="card-title">High Scores</h2>
            <div className="overflow-x-auto">
              <table className="table w-full table-sm sm:table-md">
                <thead>
                  <tr>
                    <th>Rank</th>
                    <th>Difficulty</th>
                    <th>Device</th>
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
                        <td className="text-accent">
                          {formatNumber(score.difficulty)}
                        </td>
                        <td>{score.device}</td>
                        <td className="text-sm text-base-content/60">
                          {formatConciseTimeAgo(new Date(score.timestamp))}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4">
        <div className="card bg-base-100 shadow-xl card-compact sm:card-normal">
          <div className="card-body">
            <h2 className="card-title">Online Devices</h2>
            <div className="overflow-x-auto">
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
                        <td className="break-words max-w-[18rem]">
                          {device.client || 'Other'}
                        </td>
                        <td className="text-accent">{device.activeWorkers}</td>
                        <td className="text-accent">
                          {formatHashrate(device.hashrate1hr)}
                        </td>
                        <td className="text-accent">
                          {formatNumber(device.bestEver)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
