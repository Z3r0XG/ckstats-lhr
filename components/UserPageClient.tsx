'use client';

import { useEffect } from 'react';

import PrivacyToggle from './PrivacyToggle';
import UserStatsCharts from './UserStatsCharts';
import WorkersTable from './WorkersTable';
import { useRefresh } from '../lib/contexts/RefreshContext';
import { useUserData } from '../lib/hooks/useUserData';
import { UserDataPayload } from '../lib/types/user';
import {
  formatHashrate,
  formatNumber,
  formatTimeAgo,
  getHistoricalPercentageChange,
  getPercentageChangeColor,
  calculateBlockChances,
  calculateProximityPercent,
} from '../utils/helpers';

export default function UserPageClient({
  initialData,
  address,
}: {
  initialData: UserDataPayload;
  address: string;
}) {
  const { data, isLoading, error, refetch } = useUserData(address, initialData);
  const { registerRefresh, unregisterRefresh } = useRefresh();

  useEffect(() => {
    registerRefresh(() => void refetch());
    return () => unregisterRefresh();
  }, [registerRefresh, unregisterRefresh, refetch]);

  // Show loading only on initial load when we have no data
  if (isLoading && !data) {
    return <div className="p-4">Loading user data...</div>;
  }

  // If we have no data at all, show error
  if (!data) {
    return (
      <div className="p-4 text-red-600">
        {error
          ? `Error loading user data: ${error.message}`
          : 'No user data available.'}
      </div>
    );
  }

  const { user, poolStats, historicalStats } = data;

  if (user.isActive === false) {
    return (
      <div className="container mx-auto p-4">
        <h1 className="text-2xl font-bold mb-4 break-words text-accent">
          {user.address}
        </h1>
        <div
          className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 rounded"
          role="alert"
        >
          <p className="font-bold">User is not active</p>
          <p>Contact support to reactivate.</p>
        </div>
      </div>
    );
  }

  if (user.stats.length === 0) {
    return (
      <div className="container mx-auto p-4">
        <h1 className="text-2xl font-bold mb-4 break-words text-accent">
          {user.address}
        </h1>
        <div
          className="bg-yellow-100 border-l-4 border-yellow-500 text-yellow-700 p-4 rounded"
          role="alert"
        >
          <p className="font-bold">No Stats Available Yet</p>
          <p>User is queued to start updating stats soon.</p>
        </div>
      </div>
    );
  }

  const latestStats = user.stats[0]; // Assuming stats are ordered by timestamp desc
  const networkDifficulty = poolStats?.netdiff ?? null;
  const legacyDiff = poolStats?.diff ?? null;
  const legacyAccepted = poolStats?.accepted ?? null;

  const renderPercentageChange = (key: string) => {
    const change = getHistoricalPercentageChange(
      latestStats,
      historicalStats,
      key
    );
    const color = getPercentageChangeColor(change);

    return (
      <div
        className={`stat-desc tooltip text-left ${color}`}
        data-tip="24 hour % change"
      >
        {change === 'N/A' ? 'N/A' : `${change}%`}
      </div>
    );
  };

  return (
    <div className="container mx-auto p-4">
      <div className="flex flex-col md:flex-row justify-between gap-2 mb-4">
        <h1 className="text-2xl font-bold break-words text-accent">
          {user.address}
        </h1>
        <PrivacyToggle address={user.address} initialIsPublic={user.isPublic} />
      </div>
      <div className="stats stats-vertical sm:stats-horizontal shadow-lg my-2">
        <div className="stat">
          <div className="stat-title">Worker Count</div>
          <div className="stat-value text-3xl">{user.workers.length}</div>
        </div>
        <div className="stat">
          <div className="stat-title">Authorised</div>
          <div className="stat-value text-3xl">
            {new Date(Number(user.authorised) * 1000).toLocaleDateString()}
          </div>
        </div>
        <div className="stat">
          <div className="stat-title">Last Share</div>
          <div className="stat-value text-3xl">
            {formatTimeAgo(Number(latestStats.lastShare) * 1000, 11)}
          </div>
        </div>
      </div>

      <div className="stats stats-vertical sm:stats-horizontal shadow-lg my-2">
        <div className="stat">
          <div className="stat-title">Total Shares</div>
          <div className="stat-value text-3xl">
            {formatNumber(latestStats.shares)}
          </div>
        </div>
        <div className="stat">
          <div className="stat-title">Best Share</div>
          <div className="stat-value text-3xl">
            {formatNumber(latestStats.bestShare)}
          </div>
          {(() => {
            const percent = calculateProximityPercent(
              Number(latestStats.bestShare),
              poolStats?.netdiff != null ? Number(poolStats.netdiff) : null
            );
            return percent ? (
              <div className="stat-desc text-green-600 text-xs max-w-full overflow-hidden">
                <span
                  className="tooltip tooltip-right"
                  data-tip="Best Share % of Network Difficulty"
                >
                  {percent} (Proximity)
                </span>
              </div>
            ) : null;
          })()}
        </div>
        <div className="stat">
          <div className="stat-title">Best Ever</div>
          <div className="stat-value text-3xl">
            {formatNumber(latestStats.bestEver)}
          </div>
          {(() => {
            const percent = calculateProximityPercent(
              Number(latestStats.bestEver),
              poolStats?.netdiff != null ? Number(poolStats.netdiff) : null
            );
            return percent ? (
              <div className="stat-desc text-green-600 text-xs max-w-full overflow-hidden">
                <span
                  className="tooltip tooltip-right"
                  data-tip="Best Ever % of Network Difficulty"
                >
                  {percent} (Proximity)
                </span>
              </div>
            ) : null;
          })()}
        </div>
      </div>

      <div className="stats stats-vertical sm:stats-horizontal shadow-lg my-2">
        <div className="stat">
          <div className="stat-title">Hashrate (5m)</div>
          <div className="stat-value text-3xl">
            {formatHashrate(latestStats.hashrate5m)}
          </div>
          {renderPercentageChange('hashrate5m')}
        </div>
        <div className="stat">
          <div className="stat-title">Hashrate (1hr)</div>
          <div className="stat-value text-3xl">
            {formatHashrate(latestStats.hashrate1hr)}
          </div>
          {renderPercentageChange('hashrate1hr')}
        </div>
        <div className="stat">
          <div className="stat-title">Hashrate (1d)</div>
          <div className="stat-value text-3xl">
            {formatHashrate(latestStats.hashrate1d)}
          </div>
          {renderPercentageChange('hashrate1d')}
        </div>
        <div className="stat">
          <div className="stat-title">Hashrate (7d)</div>
          <div className="stat-value text-3xl">
            {formatHashrate(latestStats.hashrate7d)}
          </div>
          {renderPercentageChange('hashrate7d')}
        </div>
      </div>

      <h2 className="text-xl font-bold mt-4">Odds of Finding a Block</h2>
      <div className="stats stats-vertical sm:stats-horizontal shadow-lg my-2">
        <div className="stat">
          <div className="stat-title">1 Day</div>
          <div className="stat-value text-3xl">
            {latestStats.hashrate1hr != null &&
            (networkDifficulty != null || legacyDiff != null)
              ? calculateBlockChances(
                  Number(latestStats.hashrate1hr) || 0,
                  networkDifficulty,
                  legacyDiff,
                  legacyAccepted
                )['1d']
              : 'N/A'}
          </div>
        </div>
        <div className="stat">
          <div className="stat-title">1 Week</div>
          <div className="stat-value text-3xl">
            {latestStats.hashrate1hr != null &&
            (networkDifficulty != null || legacyDiff != null)
              ? calculateBlockChances(
                  Number(latestStats.hashrate1hr) || 0,
                  networkDifficulty,
                  legacyDiff,
                  legacyAccepted
                )['1w']
              : 'N/A'}
          </div>
        </div>
        <div className="stat">
          <div className="stat-title">1 Month</div>
          <div className="stat-value text-3xl">
            {latestStats.hashrate1hr != null &&
            (networkDifficulty != null || legacyDiff != null)
              ? calculateBlockChances(
                  Number(latestStats.hashrate1hr) || 0,
                  networkDifficulty,
                  legacyDiff,
                  legacyAccepted
                )['1m']
              : 'N/A'}
          </div>
        </div>
        <div className="stat">
          <div className="stat-title">1 Year</div>
          <div className="stat-value text-3xl">
            {latestStats.hashrate1hr != null &&
            (networkDifficulty != null || legacyDiff != null)
              ? calculateBlockChances(
                  Number(latestStats.hashrate1hr) || 0,
                  networkDifficulty,
                  legacyDiff,
                  legacyAccepted
                )['1y']
              : 'N/A'}
          </div>
        </div>
      </div>

      <UserStatsCharts userStats={historicalStats} />

      <WorkersTable workers={user.workers} address={address} />
    </div>
  );
}
