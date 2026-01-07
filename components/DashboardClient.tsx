'use client';

import Link from 'next/link';

import PoolStatsChart from './PoolStatsChart';
import PoolStatsDisplay from './PoolStatsDisplay';
import { useDashboardData } from '../lib/hooks/useDashboardData';
import { DashboardPayload } from '../lib/types/dashboard';
import { formatHashrate, formatNumber, formatTimeAgo } from '../utils/helpers';

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
                    <th>Timestamp</th>
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
                        <td>{formatTimeAgo(new Date(score.timestamp))}</td>
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
                    <th>Client</th>
                    <th>Active Workers</th>
                    <th>Hashrate 1hr</th>
                    <th>Best Ever</th>
                  </tr>
                </thead>
                <tbody>
                  {(data.onlineDevices ?? []).length === 0 ? (
                    <tr>
                      <td
                        colSpan={4}
                        className="text-center text-sm text-base-content/60"
                      >
                        No devices online
                      </td>
                    </tr>
                  ) : (
                    (data.onlineDevices ?? []).map((device) => (
                      <tr key={device.client}>
                        <td>{device.client}</td>
                        <td>{device.activeWorkers}</td>
                        <td>{formatHashrate(device.hashrate1hr)}</td>
                        <td>{formatNumber(device.bestEver)}</td>
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
