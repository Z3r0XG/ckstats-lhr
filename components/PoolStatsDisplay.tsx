import Link from 'next/link';

import { PoolStats } from '../lib/entities/PoolStats';
import type { ServiceSnapshot } from '../lib/poolHealth';
import {
  formatNumber,
  formatHashrate,
  formatTimeAgo,
  formatDurationCapped,
  getHistoricalPercentageChange,
  getPercentageChangeColor,
  calculateAverageTimeToBlock,
  computeRejectedPercent,
  computeAcceptedPct,
  calculateProximityPercent,
} from '../utils/helpers';

interface PoolStatsDisplayProps {
  stats: PoolStats;
  historicalStats: PoolStats[];
  generatedAt?: Date;
  service?: ServiceSnapshot;
}

// ckstats-meta service health → label + daisyUI badge color.
const HEALTH_BADGE: Record<string, { label: string; cls: string }> = {
  healthy: { label: 'Healthy', cls: 'badge-success' },
  degraded: { label: 'Degraded', cls: 'badge-warning' },
  down: { label: 'Down', cls: 'badge-error' },
  unknown: { label: 'N/A', cls: 'badge-ghost' },
};

export default function PoolStatsDisplay({
  stats,
  historicalStats,
  generatedAt,
  service,
}: PoolStatsDisplayProps) {
  const showRejectedStat =
    process.env.NEXT_PUBLIC_SHOW_REJECTED_STATS === 'true';
  const showShareCounts = process.env.NEXT_PUBLIC_SHOW_SHARE_COUNTS === 'true';

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
    } else if (key === 'accepted') {
      return 'Accepted Diff';
    } else if (key === 'rejected') {
      return 'Rejected Diff';
    }
    return key
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, (str) => str.toUpperCase());
  };

  // 'Users' is now the dedicated "Connections" card in the 3-section top, so it's not a statGroup.
  const statGroups = [
    {
      title: 'Shares since last found block',
      keys: ['accepted', 'rejected', 'shareCount', 'bestshare'],
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
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        {/* Stats — ckstats meta (our view: ingest health + data freshness) */}
        <div className="card card-compact">
          <div className="card-body">
            <h2 className="card-title">Stats</h2>
            <div className="stats stats-vertical lg:stats-horizontal shadow-lg my-2">
              <div className="stat">
                <div className="stat-title">Health</div>
                <div className="stat-value text-2xl">
                  {(() => {
                    const h =
                      HEALTH_BADGE[service?.state ?? 'unknown'] ??
                      HEALTH_BADGE.unknown;
                    return <span className={`badge ${h.cls}`}>{h.label}</span>;
                  })()}
                </div>
                {service && service.poolsTotal > 0 && (
                  <div className="stat-desc">
                    {service.poolsUp}/{service.poolsTotal} pools up
                  </div>
                )}
              </div>
              <div className="stat">
                <div className="stat-title">Last Update</div>
                <div className="stat-value text-2xl">
                  {formatTimeAgo(
                    service?.lastDataChange != null
                      ? new Date(service.lastDataChange)
                      : (generatedAt ?? stats.timestamp)
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Pool Status — ckpool meta; the title links to the per-pool Status page */}
        <div className="card card-compact">
          <div className="card-body">
            <h2 className="card-title">
              <Link href="/status" className="link text-primary">
                Pool Status
              </Link>
            </h2>
            <div className="stats stats-vertical lg:stats-horizontal shadow-lg my-2">
              <div className="stat">
                <div className="stat-title">Net Diff</div>
                <div className="stat-value text-2xl">
                  {(() => {
                    const netdiff =
                      stats.netdiff != null ? Number(stats.netdiff) : null;
                    return netdiff != null && netdiff > 0
                      ? formatWithUnits(netdiff)
                      : 'N/A';
                  })()}
                </div>
              </div>
              {(() => {
                const networkDifficulty =
                  stats.netdiff != null
                    ? stats.netdiff
                    : stats.diff != null &&
                        stats.accepted != null &&
                        Number(stats.diff) > 0
                      ? (Number(stats.accepted) / (Number(stats.diff) * 100)) *
                        10000
                      : null;
                const avgTimeStr = (() => {
                  if (stats.hashrate6hr == null || networkDifficulty == null)
                    return 'N/A';
                  const seconds = calculateAverageTimeToBlock(
                    stats.hashrate6hr,
                    networkDifficulty
                  );
                  return formatDurationCapped(seconds);
                })();
                return (
                  <div className="stat">
                    <div className="stat-title">Avg Time to Find a Block</div>
                    <div className="stat-value text-2xl">{avgTimeStr}</div>
                    <div className="stat-desc">
                      {(process.env.NEXT_PUBLIC_COIN ?? 'BTC') === 'BTC' ? (
                        <Link
                          href={`https://mempool.space/mining/pool/${process.env.NEXT_PUBLIC_MEMPOOL_LINK_TAG}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="link text-primary"
                        >
                          Found Blocks
                        </Link>
                      ) : null}
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>

        {/* Connections — ckpool meta */}
        <div className="card card-compact">
          <div className="card-body">
            <h2 className="card-title">Connections</h2>
            <div className="stats stats-vertical lg:stats-horizontal shadow-lg my-2">
              <div className="stat">
                <div className="stat-title">Users</div>
                <div className="stat-value text-2xl">
                  {formatNumber(stats.users)}
                </div>
                <div className="stat-desc">
                  Idle: {formatNumber(stats.idle)}
                </div>
              </div>
              <div className="stat">
                <div className="stat-title">Workers</div>
                <div className="stat-value text-2xl">
                  {formatNumber(stats.workers)}
                </div>
                <div className="stat-desc">
                  Disconnected: {formatNumber(stats.disconnected)}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {statGroups.map((group) => (
          <div key={group.title} className="card card-compact">
            <div className="card-body">
              <h2 className="card-title">{group.title}</h2>
              <div className="stats stats-vertical lg:stats-horizontal shadow-lg my-2">
                {group.keys.map((key) => {
                  if (key === 'shareCount') {
                    if (!showShareCounts) return null;
                    const ac = stats.accepted_count;
                    const rc = stats.rejected_count;
                    const hasData = ac != null && rc != null;
                    const color = 'text-success';
                    const acceptedPct = hasData
                      ? computeAcceptedPct(ac, rc)
                      : null;
                    return (
                      <div key="share-count" className="stat">
                        <div className="stat-title">Total Shares</div>
                        <div className="stat-value text-2xl">
                          {hasData
                            ? `${formatNumber(rc!)} / ${formatNumber(ac!)}`
                            : 'N/A'}
                        </div>
                        {hasData && acceptedPct && (
                          <div
                            className={`stat-desc text-left ${color} max-w-full overflow-hidden`}
                          >
                            {acceptedPct} (Accepted)
                          </div>
                        )}
                      </div>
                    );
                  }
                  return (
                    <div
                      key={key}
                      className={`stat${
                        key === 'rejected' && !showRejectedStat ? ' hidden' : ''
                      }`}
                    >
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
                            <div className="stat-desc text-success max-w-full overflow-hidden">
                              {display} (Effort)
                            </div>
                          );
                        })()}
                      {key === 'users' && (
                        <div className="stat-desc">
                          Idle: {formatNumber(stats.idle)}
                        </div>
                      )}
                      {key === 'workers' && (
                        <div className="stat-desc">
                          Disconnected: {formatNumber(stats.disconnected)}
                        </div>
                      )}
                      {key === 'rejected' &&
                        showRejectedStat &&
                        (() => {
                          const { formatted, color } = computeRejectedPercent(
                            stats.accepted,
                            stats.rejected
                          );
                          return (
                            <div
                              className={`stat-desc text-left ${color} max-w-full overflow-hidden`}
                            >
                              {formatted === null ? 'N/A' : formatted} (Invalid)
                            </div>
                          );
                        })()}
                      {key === 'bestshare' &&
                        (() => {
                          const percent = calculateProximityPercent(
                            Number(stats.bestshare),
                            stats.netdiff != null ? Number(stats.netdiff) : null
                          );
                          return (
                            <div className="stat-desc text-success max-w-full overflow-hidden">
                              {percent || 'N/A'} (Proximity)
                            </div>
                          );
                        })()}
                      {['SPS1m', 'SPS5m', 'SPS15m', 'SPS1h'].includes(key) &&
                        renderPercentageChange(key)}
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
