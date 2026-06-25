'use client';

import { useEffect } from 'react';

import PrivacyToggle from './PrivacyToggle';
import StatInfo from './StatInfo';
import UserResetButton from './UserResetButton';
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
import { isVisible, anyVisible } from '../utils/visibility';
import { isWorkerActive } from '../utils/workerActivity';

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
          <UserResetButton address={user.address} />
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
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        {anyVisible([
          'user.connection.workers',
          'user.connection.authorised',
          'user.connection.lastshare',
        ]) && (
          <div className="card card-compact">
            <div className="card-body">
              <h2 className="card-title">
                Connection
                <StatInfo id="help-user-connection">
                  <p className="mb-1 font-semibold">Connection</p>
                  <ul className="ml-4 list-disc space-y-1">
                    <li>
                      <strong>Workers</strong> — number of workers currently
                      active for this user.
                    </li>
                    <li>
                      <strong>Total</strong> — historical number of all workers
                      associated with this user.
                    </li>
                    <li>
                      <strong>Authorised</strong> — date this user&rsquo;s first
                      worker was authorised by the pool.
                    </li>
                    <li>
                      <strong>Last Share</strong> — how long since any worker
                      submitted a share for this user.
                    </li>
                  </ul>
                </StatInfo>
              </h2>
              <div className="stats stats-vertical lg:stats-horizontal shadow-lg my-2">
                {isVisible('user.connection.workers') && (
                  <div className="stat">
                    <div className="stat-title">Workers</div>
                    <div className="stat-value text-2xl">
                      {user.workers.filter(isWorkerActive).length}
                    </div>
                    <div className="stat-desc">
                      {isVisible('user.connection.workers.subtext') ? (
                        <>Total: {user.workers.length}</>
                      ) : (
                        <>&nbsp;</>
                      )}
                    </div>
                  </div>
                )}
                {isVisible('user.connection.authorised') && (
                  <div className="stat">
                    <div className="stat-title">Authorised</div>
                    <div className="stat-value text-2xl">
                      {new Date(
                        Number(user.authorised) * 1000
                      ).toLocaleDateString()}
                    </div>
                    <div className="stat-desc">&nbsp;</div>
                  </div>
                )}
                {isVisible('user.connection.lastshare') && (
                  <div className="stat">
                    <div className="stat-title">Last Share</div>
                    <div className="stat-value text-2xl">
                      {formatTimeAgo(Number(latestStats.lastShare) * 1000, 11)}
                    </div>
                    <div className="stat-desc">&nbsp;</div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
        {anyVisible([
          'user.difficulty.accepted',
          'user.difficulty.bestdiff',
          'user.difficulty.bestever',
        ]) && (
          <div className="card card-compact">
            <div className="card-body">
              <h2 className="card-title">
                Difficulty
                <StatInfo id="help-user-difficulty">
                  <p className="mb-1 font-semibold">Difficulty</p>
                  <ul className="ml-4 list-disc space-y-1">
                    <li>
                      <strong>Accepted Work</strong> — sum of the pool-assigned
                      difficulty of accepted shares: the valid work the pool
                      credited this round, and what Effort is measured against.
                    </li>
                    <li>
                      <strong>Effort</strong> — this round&rsquo;s work as a
                      percentage of the average work done between blocks. The
                      effort to find a block is exponentially distributed (a
                      memoryless <strong>Poisson</strong> process) — it averages
                      100% but swings widely: half the blocks are found by ~69%
                      effort, a lucky quarter by ~29%, and an unlucky tenth
                      takes over ~230%.
                    </li>
                    <li>
                      <strong>Best Diff</strong> — highest found difficulty
                      submitted by any share this round.
                    </li>
                    <li>
                      <strong>Proximity</strong> — how close the Best Diff was
                      to solving a block.
                    </li>
                    <li>
                      <strong>Best Ever</strong> — highest found difficulty ever
                      submitted by any share.
                    </li>
                  </ul>
                </StatInfo>
              </h2>
              <div className="stats stats-vertical lg:stats-horizontal shadow-lg my-2">
                {isVisible('user.difficulty.accepted') && (
                  <div className="stat">
                    <div className="stat-title">Accepted Work</div>
                    <div className="stat-value text-2xl">
                      {formatNumber(latestStats.shares)}
                    </div>
                    {isVisible('user.difficulty.accepted.subtext') ? (
                      (() => {
                        const shares = Number(latestStats.shares);
                        let effortPercent: number | null = null;

                        if (
                          networkDifficulty != null &&
                          Number(networkDifficulty) > 0
                        ) {
                          effortPercent =
                            (shares / Number(networkDifficulty)) * 100;
                        } else if (
                          legacyDiff != null &&
                          legacyAccepted != null &&
                          Number(legacyAccepted) > 0
                        ) {
                          effortPercent =
                            (shares * Number(legacyDiff)) /
                            Number(legacyAccepted);
                        }

                        if (effortPercent === null)
                          return <div className="stat-desc">&nbsp;</div>;

                        let display = '';
                        if (effortPercent === 0) {
                          display = '0%';
                        } else if (effortPercent < 0.01) {
                          display = '<0.01%';
                        } else {
                          display = effortPercent.toFixed(2) + '%';
                        }

                        return (
                          <div className="stat-desc text-success max-w-full overflow-hidden">
                            {display} (Effort)
                          </div>
                        );
                      })()
                    ) : (
                      <div className="stat-desc">&nbsp;</div>
                    )}
                  </div>
                )}
                {isVisible('user.difficulty.bestdiff') && (
                  <div className="stat">
                    <div className="stat-title">Best Diff</div>
                    <div className="stat-value text-2xl">
                      {formatNumber(latestStats.bestShare)}
                    </div>
                    {isVisible('user.difficulty.bestdiff.subtext') ? (
                      (() => {
                        const percent = calculateProximityPercent(
                          Number(latestStats.bestShare),
                          poolStats?.netdiff != null
                            ? Number(poolStats.netdiff)
                            : null
                        );
                        return percent ? (
                          <div className="stat-desc text-success text-xs max-w-full overflow-hidden">
                            {percent} (Proximity)
                          </div>
                        ) : (
                          <div className="stat-desc">&nbsp;</div>
                        );
                      })()
                    ) : (
                      <div className="stat-desc">&nbsp;</div>
                    )}
                  </div>
                )}
                {isVisible('user.difficulty.bestever') && (
                  <div className="stat">
                    <div className="stat-title">Best Ever</div>
                    <div className="stat-value text-2xl">
                      {formatNumber(latestStats.bestEver)}
                    </div>
                    {isVisible('user.difficulty.bestever.subtext') ? (
                      (() => {
                        const percent = calculateProximityPercent(
                          Number(latestStats.bestEver),
                          poolStats?.netdiff != null
                            ? Number(poolStats.netdiff)
                            : null
                        );
                        return percent ? (
                          <div className="stat-desc text-success text-xs max-w-full overflow-hidden">
                            {percent} (Proximity)
                          </div>
                        ) : (
                          <div className="stat-desc">&nbsp;</div>
                        );
                      })()
                    ) : (
                      <div className="stat-desc">&nbsp;</div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        {anyVisible([
          'user.hashrates.5m',
          'user.hashrates.1hr',
          'user.hashrates.1d',
          'user.hashrates.7d',
        ]) && (
          <div className="card card-compact">
            <div className="card-body">
              <h2 className="card-title">
                Hashrates
                <StatInfo id="help-user-hashrates">
                  <p className="mb-1 font-semibold">Hashrates</p>
                  <p>
                    Calculated hashrate over time for all devices for this user.
                  </p>
                </StatInfo>
              </h2>
              <div className="stats stats-vertical lg:stats-horizontal shadow-lg my-2">
                {[
                  { id: '5m', label: 'Hashrate (5m)', key: 'hashrate5m' },
                  { id: '1hr', label: 'Hashrate (1hr)', key: 'hashrate1hr' },
                  { id: '1d', label: 'Hashrate (1d)', key: 'hashrate1d' },
                  { id: '7d', label: 'Hashrate (7d)', key: 'hashrate7d' },
                ]
                  .filter((h) => isVisible(`user.hashrates.${h.id}`))
                  .map((h) => (
                    <div key={h.id} className="stat">
                      <div className="stat-title">{h.label}</div>
                      <div className="stat-value text-2xl">
                        {formatHashrate(latestStats[h.key])}
                      </div>
                      {isVisible(`user.hashrates.${h.id}.subtext`) ? (
                        renderPercentageChange(h.key)
                      ) : (
                        <div className="stat-desc">&nbsp;</div>
                      )}
                    </div>
                  ))}
              </div>
            </div>
          </div>
        )}
        {anyVisible([
          'user.odds.1d',
          'user.odds.1w',
          'user.odds.1m',
          'user.odds.1y',
        ]) && (
          <div className="card card-compact">
            <div className="card-body">
              <h2 className="card-title">
                Odds of Finding a Block
                <StatInfo id="help-user-odds">
                  <p className="mb-1 font-semibold">Odds of Finding a Block</p>
                  <p>
                    The statistical chance of this user finding at least one
                    block within each window, based on current hashrate and
                    network difficulty.
                  </p>
                </StatInfo>
              </h2>
              <div className="stats stats-vertical lg:stats-horizontal shadow-lg my-2">
                {(
                  [
                    { id: '1d', label: '1 Day', win: '1d' },
                    { id: '1w', label: '1 Week', win: '1w' },
                    { id: '1m', label: '1 Month', win: '1m' },
                    { id: '1y', label: '1 Year', win: '1y' },
                  ] as const
                )
                  .filter((o) => isVisible(`user.odds.${o.id}`))
                  .map((o) => (
                    <div key={o.id} className="stat">
                      <div className="stat-title">{o.label}</div>
                      <div className="stat-value text-2xl">
                        {latestStats.hashrate1hr != null &&
                        (networkDifficulty != null || legacyDiff != null)
                          ? calculateBlockChances(
                              Number(latestStats.hashrate1hr) || 0,
                              networkDifficulty,
                              legacyDiff,
                              legacyAccepted
                            )[o.win]
                          : 'N/A'}
                      </div>
                      <div className="stat-desc">&nbsp;</div>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {isVisible('user.chart') && (
        <UserStatsCharts userStats={historicalStats} />
      )}

      {isVisible('user.workers') && (
        <WorkersTable workers={user.workers} address={address} />
      )}
    </div>
  );
}
