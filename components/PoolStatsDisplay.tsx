import dynamic from 'next/dynamic';
import Link from 'next/link';

import { PoolStats } from '../lib/entities/PoolStats';
import {
  formatNumber,
  formatHashrate,
  formatTimeAgo,
  formatDuration,
  getHistoricalPercentageChange,
  getPercentageChangeColor,
  calculateAverageTimeToBlock,
  computeRejectedPercent,
} from '../utils/helpers';

const CountdownTimer = dynamic(() => import('./CountdownTimer'), {
  ssr: false,
});

interface PoolStatsDisplayProps {
  stats: PoolStats;
  historicalStats: PoolStats[];
  onRefresh?: () => void;
  generatedAt?: Date;
  error?: Error | null;
  isFetching?: boolean;
}

export default function PoolStatsDisplay({
  stats,
  historicalStats,
  onRefresh,
  generatedAt,
  error,
  isFetching,
}: PoolStatsDisplayProps) {
  const formatWithUnits = (value: number): string => {
    const units = [
      { v: 1e12, s: 'T' },
      { v: 1e9, s: 'G' },
      { v: 1e6, s: 'M' },
      { v: 1e3, s: 'k' },
    ];
    for (const u of units) {
      if (value >= u.v) {
        return `${(value / u.v).toFixed(1)} ${u.s}`;
      }
    }
    return formatNumber(value);
  };

  const formatValue = (key: string, value: any): string => {
    if (key.startsWith('hashrate')) {
      return formatHashrate(value);
    } else if (key === 'diff') {
      return `${formatNumber(value)}%`;
    } else if (
      typeof value === 'bigint' ||
      typeof value === 'number' ||
      typeof value === 'string'
    ) {
      return formatNumber(value);
    } else if (key === 'timestamp') {
      return new Date(value).toISOString().slice(0, 19) + ' UTC';
    }
    return String(value);
  };

  const formatKey = (key: string): string => {
    if (key.startsWith('hashrate') || key.startsWith('SPS')) {
      return key.replace(/^(hashrate|SPS)/, '').toUpperCase();
    } else if (key === 'diff') {
      return '% of Network Diff';
    } else if (key === 'bestshare') {
      return 'Best Diff';
    }
    return key
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, (str) => str.toUpperCase());
  };

  const statGroups = [
    { title: 'Users', keys: ['users', 'disconnected', 'workers'] },
    {
      title: 'Shares since last found block',
      keys: ['accepted', 'rejected', 'bestshare', 'diff'],
    },
    { title: 'Shares Per Second', keys: ['SPS1m', 'SPS5m', 'SPS15m', 'SPS1h'] },
  ];

  const hashrateGroup = {
    title: 'Hashrates',
    keys: [
      'hashrate1m',
      'hashrate5m',
      'hashrate15m',
      'hashrate1hr',
      'hashrate6hr',
      'hashrate1d',
      'hashrate7d',
    ],
  };

  const renderPercentageChange = (key: string) => {
    const change = getHistoricalPercentageChange(stats, historicalStats, key);
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
    <div className="grid grid-cols-1 gap-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <div className="card card-compact">
          <div className="card-body">
            <div className="flex items-center justify-between gap-2">
              <h2 className="card-title">General Info</h2>
              <CountdownTimer
                initialSeconds={60}
                onElapsed={onRefresh}
                error={error}
                isFetching={isFetching}
              />
            </div>
            <div className="stats stats-vertical xl:stats-horizontal shadow-lg my-2">
              <div className="stat">
                <div className="stat-title">Uptime</div>
                <div className="stat-value text-2xl">
                  {formatDuration(stats.runtime)}
                </div>
              </div>
              <div className="stat">
                <div className="stat-title">Last Update</div>
                <div className="stat-value text-2xl">
                  {formatTimeAgo(generatedAt ?? stats.timestamp)}
                </div>
              </div>
              <div className="stat">
                <div className="stat-title">Avg Time to Find a Block</div>
                <div className="stat-value text-2xl">
                  {(() => {
                    const denom = Math.round(Number(stats.diff) * 100);
                    if (stats.hashrate6hr && denom > 0) {
                      return formatDuration(
                        calculateAverageTimeToBlock(
                          stats.hashrate6hr,
                          (BigInt(stats.accepted) * BigInt(10000)) /
                            BigInt(denom)
                        )
                      );
                    }
                    return 'N/A';
                  })()}
                </div>
                <div className="stat-desc">
                  <Link
                    href={`https://mempool.space/mining/pool/${process.env.NEXT_PUBLIC_MEMPOOL_LINK_TAG ?? 'solock'}`}
                    target="_blank"
                    className="link text-primary"
                  >
                    Found Blocks
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
        {statGroups.map((group) => (
          <div key={group.title} className="card card-compact">
            <div className="card-body">
              <h2 className="card-title">{group.title}</h2>
              <div className="stats stats-vertical lg:stats-horizontal shadow-lg my-2">
                {group.keys.map((key) => {
                  if (key === 'diff') {
                    const netdiff =
                      stats.netdiff != null ? Number(stats.netdiff) : null;
                    const netdiffStr =
                      netdiff != null && netdiff > 0
                        ? formatWithUnits(netdiff)
                        : 'N/A';
                    return (
                      <div key="network-diff" className="stat">
                        <div className="stat-title">Network Diff</div>
                        <div className="stat-value text-2xl">{netdiffStr}</div>
                      </div>
                    );
                  }
                  return (
                    <div key={key} className="stat">
                      <div className="stat-title">{formatKey(key)}</div>
                      <div className="stat-value text-2xl">
                        {formatValue(key, stats[key])}
                      </div>

                      {key === 'accepted' &&
                        (() => {
                          const percent = Number(stats.diff);
                          let display = '';
                          if (percent === 0) {
                            display = '0%';
                          } else if (percent < 0.01) {
                            display = '<0.01%';
                          } else {
                            display = percent.toFixed(2) + '%';
                          }
                          return (
                            <div className="stat-desc text-green-600 max-w-full overflow-hidden">
                              <span
                                className="inline-block tooltip tooltip-right"
                                data-tip="Accepted Diff % of Network Diff"
                              >
                                {display} (Effort)
                              </span>
                            </div>
                          );
                        })()}
                      {key === 'users' && (
                        <div className="stat-desc">
                          Idle: {formatNumber(stats.idle)}
                        </div>
                      )}
                      {key === 'rejected' &&
                        (() => {
                          const { formatted, color } = computeRejectedPercent(
                            stats.accepted,
                            stats.rejected
                          );
                          return (
                            <div
                              className={`stat-desc text-left ${color} max-w-full overflow-hidden`}
                            >
                              <span
                                className="inline-block tooltip tooltip-right"
                                data-tip="Rejected Diff % of Total Submitted Diff"
                              >
                                {formatted === null ? 'N/A' : formatted} (Error
                                Rate)
                              </span>
                            </div>
                          );
                        })()}

                      {key === 'bestshare' &&
                        (() => {
                          const best = Number(stats.bestshare);
                          const netdiff = Number(stats.netdiff);
                          let percent = '';
                          if (best > 0 && netdiff > 0) {
                            const rawPercent = (best / netdiff) * 100;
                            if (rawPercent === 0) {
                              percent = '0%';
                            } else if (rawPercent < 0.01) {
                              percent = '<0.01%';
                            } else {
                              percent = rawPercent.toFixed(2) + '%';
                            }
                          }
                          return (
                            <div className="stat-desc text-green-600 max-w-full overflow-hidden">
                              <span
                                className="inline-block tooltip tooltip-right"
                                data-tip="Best Submitted Diff % of Network Diff"
                              >
                                {percent || 'N/A'} (Proximity)
                              </span>
                            </div>
                          );
                        })()}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="card card-compact">
        <div className="card-body">
          <h2 className="card-title">{hashrateGroup.title}</h2>
          <div className="stats stats-vertical lg:stats-horizontal shadow-lg my-2">
            {hashrateGroup.keys.map((key) => (
              <div key={key} className="stat">
                <div className="stat-title">{formatKey(key)}</div>
                <div className="stat-value text-2xl">
                  {formatValue(key, stats[key])}
                </div>
                {renderPercentageChange(key)}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
