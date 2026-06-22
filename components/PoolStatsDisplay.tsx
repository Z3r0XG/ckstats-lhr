import type { ReactNode } from 'react';

import Link from 'next/link';

import StatInfo from './StatInfo';
import { PoolStats } from '../lib/entities/PoolStats';
import type { ServiceSnapshot } from '../lib/poolHealth';
import {
  formatNumber,
  formatHashrate,
  findISOUnit,
  formatTimeAgo,
  formatDuration,
  formatDurationCapped,
  getHistoricalPercentageChange,
  getPercentageChangeColor,
  calculateAverageTimeToBlock,
  computeRejectedPercent,
  computeAcceptedPct,
  calculateProximityPercent,
} from '../utils/helpers';
import { isVisible, anyVisible } from '../utils/visibility';

interface PoolStatsDisplayProps {
  stats: PoolStats;
  historicalStats: PoolStats[];
  generatedAt?: Date;
  service?: ServiceSnapshot;
}

// ckstats-meta service health → label + theme text color (rendered as plain stat text, not a pill).
const HEALTH_BADGE: Record<string, { label: string; cls: string }> = {
  healthy: { label: 'Healthy', cls: 'text-success' },
  degraded: { label: 'Degraded', cls: 'text-warning' },
  down: { label: 'Down', cls: 'text-error' },
  unknown: { label: 'N/A', cls: '' },
};

export default function PoolStatsDisplay({
  stats,
  historicalStats,
  generatedAt,
  service,
}: PoolStatsDisplayProps) {
  // Pool magnitudes at a single decimal place (Best/Net Diff, Work, SPS, share counts) for a
  // consistent look. Full ISO unit range (k…Z) so large difficulties read as "4.9 P", not "4896 T".
  const fmt1 = (value: number | bigint | string): string => {
    const n = Number(value);
    if (!Number.isFinite(n)) return formatNumber(value);
    const u = findISOUnit(Math.abs(n));
    return u.iso ? `${(n / u.threshold).toFixed(1)} ${u.iso}` : n.toFixed(1);
  };

  const formatValue = (key: string, value: any): string => {
    if (key.startsWith('hashrate')) {
      return formatHashrate(value, false, 1);
    } else if (key === 'diff') {
      return `${formatNumber(value)}%`;
    } else if (
      typeof value === 'bigint' ||
      typeof value === 'number' ||
      typeof value === 'string'
    ) {
      return fmt1(value);
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
      // Bare label — the "Work Submitted" card title carries the noun.
      return 'Accepted';
    } else if (key === 'rejected') {
      return 'Rejected';
    }
    return key
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, (str) => str.toUpperCase());
  };

  // 'Users' is now the dedicated "Connections" card in the 3-section top, so it's not a statGroup.
  // Two share panels share a row: difficulty sums (the round's accepted/rejected work) vs raw
  // submission counts. Splitting them keeps the diff axis and the count axis distinct.
  const statGroups: {
    title: string;
    id: string;
    keys: string[];
    help?: ReactNode;
  }[] = [
    {
      title: 'Work Submitted',
      id: 'dashboard.work',
      keys: ['effort', 'accepted', 'rejected'],
      help: (
        <>
          <p className="mb-1 font-semibold">Work Submitted</p>
          <p>
            The pool&rsquo;s work this round, since the last block it found.
            Resets on a block find.
          </p>
          <ul className="ml-4 mt-2 list-disc space-y-1">
            <li>
              <strong>Effort</strong> — this round&rsquo;s work as a percentage
              of the average work done between blocks. The effort to find a
              block is exponentially distributed (a memoryless{' '}
              <strong>Poisson</strong> process) — it averages 100% but swings
              widely: half the blocks are found by ~69% effort, a lucky quarter
              by ~29%, and an unlucky tenth takes over ~230%.
            </li>
            <li>
              <strong>Accepted Work</strong> — sum of the pool-assigned
              difficulty of accepted shares: the valid work the pool credited
              this round, and what Effort is measured against.
            </li>
            <li>
              <strong>Rejected Work</strong> — sum of the pool-assigned
              difficulty of rejected shares: work the pool didn&rsquo;t credit.
              Shares get rejected for reasons like <em>stale</em> (submitted for
              work the pool has already replaced) or <em>low difficulty</em>{' '}
              (below the pool&rsquo;s required share target).
            </li>
          </ul>
          <p className="mt-2">
            Both Accepted and Rejected Work are difficulty-weighted, so a single
            worker on a very high difficulty can distort the accepted/rejected
            ratio.
          </p>
        </>
      ),
    },
    {
      title: 'Share Counts',
      id: 'dashboard.sharecounts',
      keys: ['shareCount'],
      help: (
        <>
          <p className="mb-1 font-semibold">Share Counts</p>
          <p>
            The pool&rsquo;s shares this round, since the last block it found.
            Resets on a block find.
          </p>
          <ul className="ml-4 mt-2 list-disc space-y-1">
            <li>
              <strong>Total</strong> — count of submitted shares to the pool.
            </li>
            <li>
              <strong>Accepted</strong> — count of submitted shares accepted by
              the pool.
            </li>
            <li>
              <strong>Rejected</strong> — count of submitted shares rejected by
              the pool.
            </li>
          </ul>
        </>
      ),
    },
  ];

  // SPS is a time-windowed series (1m/5m/15m/1h) — structurally a sibling of Hashrates, so it gets
  // its own full-width row rather than being squeezed into the 2-up share panels. ckpool only emits
  // these four windows (no 6hr/1d/7d SPS), so the row is intentionally narrower than Hashrates.
  const spsGroup = {
    title: 'Shares Per Second',
    keys: ['SPS1m', 'SPS5m', 'SPS15m', 'SPS1h'],
  };

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
      {/* Three equal 2-stat cards: Stats Service · Pool Service · Connections. A hidden card
          returns null and the grid left-packs the survivors. */}
      <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
        {/* Stats — ckstats meta (our service view: ingest health + data freshness) */}
        {anyVisible([
          'dashboard.stats_service.streams',
          'dashboard.stats_service.lastupdate',
        ]) && (
          <div className="card card-compact">
            <div className="card-body">
              <h2 className="card-title">
                Stats Service
                <StatInfo id="help-stats-service">
                  <p className="mb-1 font-semibold">Stats Service</p>
                  <ul className="ml-4 list-disc space-y-1">
                    <li>
                      <strong>Status</strong> — pool connection health:
                      <ul className="ml-4 mt-1 list-[circle] space-y-0.5">
                        <li>Healthy — all configured streams reporting</li>
                        <li>Degraded — one or more streams disconnected</li>
                        <li>Down — all streams disconnected</li>
                      </ul>
                    </li>
                    <li>
                      <strong>Last Update</strong> — how long since the stats
                      fetched new data.
                    </li>
                  </ul>
                </StatInfo>
              </h2>
              <div className="stats stats-vertical lg:stats-horizontal shadow-lg my-2">
                {/* Streams = how many configured streams are up (the concrete metric), colored by
                    health. The subtext carries the explicit health word, and links the literal word
                    "Status" to the per-pool /status page (gated to >1 stream — a single pool has no
                    per-pool detail). The link lives on the subtext word, not the card title. */}
                {isVisible('dashboard.stats_service.streams') && (
                  <div className="stat">
                    <div className="stat-title">Streams</div>
                    {(() => {
                      const h =
                        HEALTH_BADGE[service?.state ?? 'unknown'] ??
                        HEALTH_BADGE.unknown;
                      const hasPools = !!service && service.poolsTotal > 0;
                      const count = hasPools
                        ? `${service!.poolsUp} of ${service!.poolsTotal}`
                        : 'N/A';
                      const multi = !!service && service.poolsTotal > 1;
                      return (
                        <>
                          <div className="stat-value text-2xl">{count}</div>
                          <div className="stat-desc">
                            {multi ? (
                              <Link
                                href="/status"
                                className="link text-primary"
                              >
                                Status
                              </Link>
                            ) : (
                              'Status'
                            )}
                            : <span className={h.cls}>{h.label}</span>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                )}
                {isVisible('dashboard.stats_service.lastupdate') && (
                  <div className="stat">
                    <div className="stat-title">Last Update</div>
                    {/* Relative "x ago" is computed from the current time, which differs between the
                        server render and client hydration (PoolStatsDisplay runs in DashboardClient's
                        client tree) — suppress the expected text mismatch. */}
                    <div
                      className="stat-value text-2xl"
                      suppressHydrationWarning
                    >
                      {formatTimeAgo(
                        service?.lastDataChange != null
                          ? new Date(service.lastDataChange)
                          : (generatedAt ?? stats.timestamp)
                      )}
                    </div>
                    <div className="stat-desc">&nbsp;</div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Pool — ckpool: service uptime + pool-side freshness. Net Diff / Best Diff / Avg Time
            live in the "Difficulty" panel in the shares row. */}
        {anyVisible([
          'dashboard.pool_service.uptime',
          'dashboard.pool_service.lastupdate',
        ]) && (
          <div className="card card-compact">
            <div className="card-body">
              <h2 className="card-title">
                Pool Service
                <StatInfo id="help-pool-service">
                  <p className="mb-1 font-semibold">Pool Service</p>
                  <ul className="ml-4 list-disc space-y-1">
                    <li>
                      <strong>Uptime</strong> — how long since the pool&rsquo;s
                      service start timestamp.
                    </li>
                    <li>
                      <strong>Last Update</strong> — how long since the
                      pool&rsquo;s log update timestamp.
                    </li>
                  </ul>
                </StatInfo>
              </h2>
              <div className="stats stats-vertical lg:stats-horizontal shadow-lg my-2">
                {/* Uptime: ckpool `runtime`. On the dashboard `stats.runtime` is combined as MAX
                    across pools, so it reads as "the service has had ≥1 stream up this long". */}
                {isVisible('dashboard.pool_service.uptime') && (
                  <div className="stat">
                    <div className="stat-title">Uptime</div>
                    <div className="stat-value text-2xl">
                      {stats.runtime != null && Number(stats.runtime) > 0
                        ? formatDuration(Number(stats.runtime))
                        : 'N/A'}
                    </div>
                    <div className="stat-desc">&nbsp;</div>
                  </div>
                )}
                {/* ckpool's own `lastupdate` (pool-side freshness), combined as the stalest pool.
                    Tagged at the end like Stats Service's Last Update — but this is the POOL's
                    self-reported refresh time, distinct from our fetch time over in Stats Service. */}
                {isVisible('dashboard.pool_service.lastupdate') && (
                  <div className="stat">
                    <div className="stat-title">Last Update</div>
                    <div
                      className="stat-value text-2xl"
                      suppressHydrationWarning
                    >
                      {service?.poolLastUpdate != null
                        ? formatTimeAgo(new Date(service.poolLastUpdate))
                        : 'N/A'}
                    </div>
                    <div className="stat-desc">&nbsp;</div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Connections — ckpool meta */}
        {anyVisible([
          'dashboard.connections.users',
          'dashboard.connections.workers',
        ]) && (
          <div className="card card-compact">
            <div className="card-body">
              <h2 className="card-title">
                Connections
                <StatInfo id="help-connections">
                  <p className="mb-1 font-semibold">Connections</p>
                  <ul className="ml-4 list-disc space-y-1">
                    <li>
                      <strong>Users</strong> — total wallets connected to the
                      pool.
                    </li>
                    <li>
                      <strong>Idle</strong> — users connected but no longer
                      submitting shares.
                    </li>
                    <li>
                      <strong>Workers</strong> — total workers connected to the
                      pool.
                    </li>
                    <li>
                      <strong>Disconnected</strong> — total worker disconnects
                      in the last 10 minutes.
                    </li>
                  </ul>
                </StatInfo>
              </h2>
              <div className="stats stats-vertical lg:stats-horizontal shadow-lg my-2">
                {isVisible('dashboard.connections.users') && (
                  <div className="stat">
                    <div className="stat-title">Users</div>
                    <div className="stat-value text-2xl">
                      {formatNumber(stats.users)}
                    </div>
                    <div className="stat-desc">
                      {isVisible('dashboard.connections.users.subtext') ? (
                        <>Idle: {formatNumber(stats.idle)}</>
                      ) : (
                        <>&nbsp;</>
                      )}
                    </div>
                  </div>
                )}
                {isVisible('dashboard.connections.workers') && (
                  <div className="stat">
                    <div className="stat-title">Workers</div>
                    <div className="stat-value text-2xl">
                      {formatNumber(stats.workers)}
                    </div>
                    <div className="stat-desc">
                      {isVisible('dashboard.connections.workers.subtext') ? (
                        <>Disconnected: {formatNumber(stats.disconnected)}</>
                      ) : (
                        <>&nbsp;</>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 10-col grid so Difficulty (Net Diff · Best Diff · Avg Time, the widest values) gets an
          extra slot — span 4 vs 3 for the two share panels — to fit the Avg-Time value without a
          scrollbar. Collapses to a single stacked column on mobile. */}
      <div className="grid grid-cols-1 gap-2 md:grid-cols-10">
        {statGroups.map((group) => {
          // Auto-collapse the whole card when every one of its metrics is hidden.
          const metricKeys =
            group.id === 'dashboard.sharecounts'
              ? ['total', 'accepted', 'rejected']
              : ['effort', 'accepted', 'rejected'];
          if (!anyVisible(metricKeys.map((k) => `${group.id}.${k}`)))
            return null;
          return (
            <div key={group.title} className="card card-compact md:col-span-3">
              <div className="card-body">
                <h2 className="card-title">
                  {group.title}
                  {group.help && (
                    <StatInfo
                      id={`help-${group.title.toLowerCase().replace(/\s+/g, '-')}`}
                    >
                      {group.help}
                    </StatInfo>
                  )}
                </h2>
                <div className="stats stats-vertical lg:stats-horizontal shadow-lg my-2">
                  {group.keys.map((key) => {
                    if (key === 'shareCount') {
                      const ac = stats.accepted_count;
                      const rc = stats.rejected_count;
                      const hasData = ac != null && rc != null;
                      // Counts are share-submission tallies (well within Number range), not the
                      // astronomically large difficulty sums — plain addition is safe here.
                      const total = hasData ? Number(ac) + Number(rc) : null;
                      // Count-based ratios — the honest accept/reject split, not difficulty-weighted.
                      const acceptedPct = hasData
                        ? computeAcceptedPct(ac, rc)
                        : null;
                      const rejected = hasData
                        ? computeRejectedPercent(ac, rc)
                        : null;
                      // Total · Accepted · Rejected — each gated independently; a hidden subtext keeps
                      // a spacer so the remaining values stay baseline-aligned.
                      const boxes: ReactNode[] = [];
                      if (isVisible('dashboard.sharecounts.total')) {
                        boxes.push(
                          <div key="sc-total" className="stat">
                            <div className="stat-title">Total</div>
                            <div className="stat-value text-2xl">
                              {hasData ? fmt1(total!) : 'N/A'}
                            </div>
                            <div className="stat-desc">&nbsp;</div>
                          </div>
                        );
                      }
                      if (isVisible('dashboard.sharecounts.accepted')) {
                        boxes.push(
                          <div key="sc-accepted" className="stat">
                            <div className="stat-title">Accepted</div>
                            <div className="stat-value text-2xl">
                              {hasData ? fmt1(ac!) : 'N/A'}
                            </div>
                            {hasData &&
                            acceptedPct &&
                            isVisible(
                              'dashboard.sharecounts.accepted.subtext'
                            ) ? (
                              <div className="stat-desc text-left text-success max-w-full overflow-hidden">
                                {acceptedPct}
                              </div>
                            ) : (
                              <div className="stat-desc">&nbsp;</div>
                            )}
                          </div>
                        );
                      }
                      if (isVisible('dashboard.sharecounts.rejected')) {
                        boxes.push(
                          <div key="sc-rejected" className="stat">
                            <div className="stat-title">Rejected</div>
                            <div className="stat-value text-2xl">
                              {hasData ? fmt1(rc!) : 'N/A'}
                            </div>
                            {hasData &&
                            rejected?.formatted &&
                            isVisible(
                              'dashboard.sharecounts.rejected.subtext'
                            ) ? (
                              <div
                                className={`stat-desc text-left ${rejected.color} max-w-full overflow-hidden`}
                              >
                                {rejected.formatted}
                              </div>
                            ) : (
                              <div className="stat-desc">&nbsp;</div>
                            )}
                          </div>
                        );
                      }
                      return boxes;
                    }
                    if (key === 'effort') {
                      if (!isVisible('dashboard.work.effort')) return null;
                      // Round effort: ckpool `diff` = % of expected work done toward a block this
                      // round. Promoted from the Accepted Diff subtext to its own (leading) box, so it
                      // mirrors the Total box that leads the Share Counts card.
                      const percent = Number(stats.diff);
                      let display = 'N/A';
                      if (Number.isFinite(percent)) {
                        if (percent === 0) display = '0%';
                        else if (percent < 0.01) display = '<0.01%';
                        else
                          display = Number(percent.toFixed(2)).toString() + '%';
                      }
                      return (
                        <div key="effort" className="stat">
                          <div className="stat-title">Effort</div>
                          <div className="stat-value text-2xl">{display}</div>
                          {/* Spacer so the value baseline aligns with the subtext-bearing
                            Accepted/Rejected boxes in the same row. */}
                          <div className="stat-desc">&nbsp;</div>
                        </div>
                      );
                    }
                    // Work Submitted accepted/rejected. Gated per-metric; a hidden subtext keeps a
                    // spacer so the surviving values stay baseline-aligned.
                    if (!isVisible(`dashboard.work.${key}`)) return null;
                    return (
                      <div key={key} className="stat">
                        <div className="stat-title">{formatKey(key)}</div>
                        <div className="stat-value text-2xl">
                          {formatValue(key, stats[key])}
                        </div>

                        {key === 'accepted' &&
                          (() => {
                            const pct = computeAcceptedPct(
                              stats.accepted,
                              stats.rejected
                            );
                            return pct &&
                              isVisible('dashboard.work.accepted.subtext') ? (
                              <div className="stat-desc text-success max-w-full overflow-hidden">
                                {pct}
                              </div>
                            ) : (
                              <div className="stat-desc">&nbsp;</div>
                            );
                          })()}
                        {key === 'rejected' &&
                          (() => {
                            if (!isVisible('dashboard.work.rejected.subtext'))
                              return <div className="stat-desc">&nbsp;</div>;
                            const { formatted, color } = computeRejectedPercent(
                              stats.accepted,
                              stats.rejected
                            );
                            return (
                              <div
                                className={`stat-desc text-left ${color} max-w-full overflow-hidden`}
                              >
                                {formatted === null ? 'N/A' : formatted}
                              </div>
                            );
                          })()}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
        {/* Difficulty pair: network target + best share. Best Diff's "(Proximity)" subtext is its
            share difficulty as a % of Net Diff, so the two belong together. */}
        {anyVisible([
          'dashboard.difficulty.netdiff',
          'dashboard.difficulty.bestdiff',
          'dashboard.difficulty.avgtime',
        ]) && (
          <div className="card card-compact md:col-span-4">
            <div className="card-body">
              <h2 className="card-title">
                Difficulty
                <StatInfo id="help-difficulty">
                  <p className="mb-1 font-semibold">Difficulty</p>
                  <ul className="ml-4 list-disc space-y-1">
                    <li>
                      <strong>Net Diff</strong> — current network difficulty
                      target.
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
                      <strong>Avg Time to Block</strong> — statistical time
                      between finding blocks based on current hashrate.
                    </li>
                  </ul>
                </StatInfo>
              </h2>
              <div className="stats stats-vertical lg:stats-horizontal shadow-lg my-2">
                {isVisible('dashboard.difficulty.netdiff') && (
                  <div className="stat">
                    <div className="stat-title">Net Diff</div>
                    <div className="stat-value text-2xl">
                      {(() => {
                        const netdiff =
                          stats.netdiff != null ? Number(stats.netdiff) : null;
                        return netdiff != null && netdiff > 0
                          ? fmt1(netdiff)
                          : 'N/A';
                      })()}
                    </div>
                    {/* Spacer to align with Best Diff's (Proximity) subtext. */}
                    <div className="stat-desc">&nbsp;</div>
                  </div>
                )}
                {isVisible('dashboard.difficulty.bestdiff') && (
                  <div className="stat">
                    <div className="stat-title">Best Diff</div>
                    <div className="stat-value text-2xl">
                      {fmt1(stats.bestshare)}
                    </div>
                    {isVisible('dashboard.difficulty.bestdiff.subtext') ? (
                      (() => {
                        const percent = calculateProximityPercent(
                          Number(stats.bestshare),
                          stats.netdiff != null ? Number(stats.netdiff) : null,
                          true
                        );
                        return (
                          <div className="stat-desc text-success max-w-full overflow-hidden">
                            {percent || 'N/A'} (Proximity)
                          </div>
                        );
                      })()
                    ) : (
                      <div className="stat-desc">&nbsp;</div>
                    )}
                  </div>
                )}
                {isVisible('dashboard.difficulty.avgtime') &&
                  (() => {
                    const networkDifficulty =
                      stats.netdiff != null
                        ? stats.netdiff
                        : stats.diff != null &&
                            stats.accepted != null &&
                            Number(stats.diff) > 0
                          ? (Number(stats.accepted) /
                              (Number(stats.diff) * 100)) *
                            10000
                          : null;
                    const avgTimeStr = (() => {
                      if (
                        stats.hashrate6hr == null ||
                        networkDifficulty == null
                      )
                        return 'N/A';
                      const seconds = calculateAverageTimeToBlock(
                        stats.hashrate6hr,
                        networkDifficulty
                      );
                      return formatDurationCapped(seconds);
                    })();
                    return (
                      <div className="stat">
                        <div className="stat-title">Avg Time to Block</div>
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
        )}
      </div>
      {(() => {
        const spsId = (key: string) =>
          `dashboard.sps.${key.replace('SPS', '')}`;
        if (!anyVisible(spsGroup.keys.map(spsId))) return null;
        return (
          <div className="card card-compact">
            <div className="card-body">
              <h2 className="card-title">
                {spsGroup.title}
                <StatInfo id="help-sps">
                  <p className="mb-1 font-semibold">Shares Per Second</p>
                  <p>
                    Calculated rate of share submissions over time to the pool.
                  </p>
                </StatInfo>
              </h2>
              <div className="stats stats-vertical lg:stats-horizontal shadow-lg my-2">
                {spsGroup.keys
                  .filter((key) => isVisible(spsId(key)))
                  .map((key) => (
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
        );
      })()}

      {(() => {
        const hrId = (key: string) =>
          `dashboard.hashrates.${key.replace('hashrate', '')}`;
        if (!anyVisible(hashrateGroup.keys.map(hrId))) return null;
        return (
          <div className="card card-compact">
            <div className="card-body">
              <h2 className="card-title">
                {hashrateGroup.title}
                <StatInfo id="help-hashrates">
                  <p className="mb-1 font-semibold">Hashrates</p>
                  <p>
                    Calculated hashrate over time for all devices on the pool.
                  </p>
                </StatInfo>
              </h2>
              <div className="stats stats-vertical lg:stats-horizontal shadow-lg my-2">
                {hashrateGroup.keys
                  .filter((key) => isVisible(hrId(key)))
                  .map((key) => (
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
        );
      })()}
    </div>
  );
}
