export const revalidate = 0;
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

import Link from 'next/link';
import { notFound } from 'next/navigation';

import StatInfo from '../../../../../components/StatInfo';
import UserStatsCharts from '../../../../../components/UserStatsCharts';
import { getWorkerWithStats, getLatestPoolStats } from '../../../../../lib/api';
import {
  formatHashrate,
  formatNumber,
  formatTimeAgo,
  getHistoricalPercentageChange,
  getPercentageChangeColor,
  getWorkerUserAgentDisplay,
  calculateProximityPercent,
  serializeData,
} from '../../../../../utils/helpers';
import { validateBitcoinAddress } from '../../../../../utils/validateBitcoinAddress';
import { isVisible, anyVisible } from '../../../../../utils/visibility';

export default async function WorkerPage({
  params,
}: {
  params: { address: string; name?: string[] };
}) {
  let decodedName: string;
  let decodedAddress: string;
  try {
    decodedName = params.name ? decodeURIComponent(params.name[0]) : '';
    decodedAddress = decodeURIComponent(params.address);
  } catch {
    notFound();
  }
  if (!validateBitcoinAddress(decodedAddress)) {
    notFound();
  }
  const workerORM = await getWorkerWithStats(decodedAddress, decodedName);

  if (!workerORM) {
    notFound();
  }

  const worker = serializeData(workerORM);
  const latestStats = worker.stats[0]; // Assuming stats are ordered by timestamp desc

  if (!latestStats) {
    notFound();
  }

  const poolStats = serializeData(await getLatestPoolStats());
  const networkDifficulty = poolStats?.netdiff ?? null;
  const legacyDiff = poolStats?.diff ?? null;
  const legacyAccepted = poolStats?.accepted ?? null;

  const renderPercentageChange = (key: string, metricId: string) => {
    const change = getHistoricalPercentageChange(
      latestStats,
      worker.stats,
      key
    );
    const color = getPercentageChangeColor(change);
    const showSubtext = isVisible(`${metricId}.subtext`);

    return (
      <div
        className={`stat-desc tooltip text-left ${color}`}
        data-tip="24 hour % change"
      >
        {showSubtext ? change === 'N/A' ? 'N/A' : `${change}%` : <>&nbsp;</>}
      </div>
    );
  };

  return (
    <div className="container mx-auto p-4">
      <div className="flex items-center gap-2">
        <Link
          href={`/users/${encodeURIComponent(decodedAddress)}`}
          className="text-sm btn"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
          Back to User
        </Link>
        <h1 className="text-3xl font-bold text-accent">
          {worker.name || <span className="italic">Unnamed Worker</span>}
        </h1>
      </div>

      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        {anyVisible([
          'worker.connection.client',
          'worker.connection.uptime',
          'worker.connection.lastshare',
        ]) && (
          <div className="card card-compact">
            <div className="card-body">
              <h2 className="card-title">
                Connection
                <StatInfo id="help-worker-connection">
                  <p className="mb-1 font-semibold">Connection</p>
                  <ul className="ml-4 list-disc space-y-1">
                    <li>
                      <strong>Client</strong> — mining software or device
                      reported by this worker.
                    </li>
                    <li>
                      <strong>Uptime</strong> — how long this worker has been
                      continuously connected, or <strong>Offline</strong> if it
                      is not currently connected.
                    </li>
                    <li>
                      <strong>Last Share</strong> — how long since this worker
                      submitted a share.
                    </li>
                  </ul>
                </StatInfo>
              </h2>
              <div className="stats stats-vertical lg:stats-horizontal shadow-lg my-2">
                {isVisible('worker.connection.client') && (
                  <div className="stat">
                    <div className="stat-title">Client</div>
                    <div className="stat-value text-2xl">
                      {getWorkerUserAgentDisplay(worker.userAgentRaw)}
                    </div>
                    <div className="stat-desc">&nbsp;</div>
                  </div>
                )}
                {isVisible('worker.connection.uptime') && (
                  <div className="stat">
                    <div className="stat-title">Uptime</div>
                    <div className="stat-value text-2xl">
                      {(() => {
                        const startedSec = latestStats.started
                          ? Number(latestStats.started)
                          : 0;
                        if (startedSec <= 0) {
                          return 'Offline';
                        }
                        const diffSec = Math.max(
                          0,
                          Math.floor(Date.now() / 1000 - startedSec)
                        );
                        const h = Math.floor(diffSec / 3600);
                        const m = Math.floor((diffSec % 3600) / 60);
                        const s = diffSec % 60;
                        const parts: string[] = [];
                        if (h > 0) parts.push(`${h}h`);
                        if (m > 0 || h > 0) parts.push(`${m}m`);
                        parts.push(`${s}s`);
                        return parts.join(' ');
                      })()}
                    </div>
                    <div className="stat-desc">&nbsp;</div>
                  </div>
                )}
                {isVisible('worker.connection.lastshare') && (
                  <div className="stat">
                    <div className="stat-title">Last Share</div>
                    <div className="stat-value text-2xl">
                      {formatTimeAgo(worker.lastUpdate)}
                    </div>
                    <div className="stat-desc">&nbsp;</div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
        {anyVisible([
          'worker.difficulty.accepted',
          'worker.difficulty.bestdiff',
          'worker.difficulty.bestever',
        ]) && (
          <div className="card card-compact">
            <div className="card-body">
              <h2 className="card-title">
                Difficulty
                <StatInfo id="help-worker-difficulty">
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
                {isVisible('worker.difficulty.accepted') && (
                  <div className="stat">
                    <div className="stat-title">Accepted Work</div>
                    <div className="stat-value text-3xl">
                      {formatNumber(worker.shares)}
                    </div>
                    {(() => {
                      const shares = Number(worker.shares);
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
                      let display = '';
                      if (effortPercent === null) display = '';
                      else if (effortPercent === 0) display = '0%';
                      else if (effortPercent < 0.01) display = '<0.01%';
                      else display = effortPercent.toFixed(2) + '%';
                      return (
                        <div className="stat-desc text-success max-w-full overflow-hidden">
                          {isVisible('worker.difficulty.accepted.subtext') &&
                          display ? (
                            <>{display} (Effort)</>
                          ) : (
                            <>&nbsp;</>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                )}
                {isVisible('worker.difficulty.bestdiff') && (
                  <div className="stat">
                    <div className="stat-title">Best Diff</div>
                    <div className="stat-value text-3xl">
                      {formatNumber(worker.bestShare)}
                    </div>
                    {(() => {
                      const percent = calculateProximityPercent(
                        Number(worker.bestShare),
                        networkDifficulty != null
                          ? Number(networkDifficulty)
                          : null,
                        true
                      );
                      return (
                        <div className="stat-desc text-success text-xs max-w-full overflow-hidden">
                          {isVisible('worker.difficulty.bestdiff.subtext') &&
                          percent ? (
                            <>{percent} (Proximity)</>
                          ) : (
                            <>&nbsp;</>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                )}
                {isVisible('worker.difficulty.bestever') && (
                  <div className="stat">
                    <div className="stat-title">Best Ever</div>
                    <div className="stat-value text-3xl">
                      {formatNumber(worker.bestEver)}
                    </div>
                    {(() => {
                      const percent = calculateProximityPercent(
                        Number(worker.bestEver),
                        networkDifficulty != null
                          ? Number(networkDifficulty)
                          : null,
                        true
                      );
                      return (
                        <div className="stat-desc text-success text-xs max-w-full overflow-hidden">
                          {isVisible('worker.difficulty.bestever.subtext') &&
                          percent ? (
                            <>{percent} (Proximity)</>
                          ) : (
                            <>&nbsp;</>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
      {anyVisible([
        'worker.hashrates.1m',
        'worker.hashrates.5m',
        'worker.hashrates.1hr',
        'worker.hashrates.1d',
        'worker.hashrates.7d',
      ]) && (
        <div className="card card-compact">
          <div className="card-body">
            <h2 className="card-title">
              Hashrates
              <StatInfo id="help-worker-hashrates">
                <p className="mb-1 font-semibold">Hashrates</p>
                <p>Calculated hashrate over time for this worker.</p>
              </StatInfo>
            </h2>
            <div className="stats stats-vertical lg:stats-horizontal shadow-lg my-2">
              {isVisible('worker.hashrates.1m') && (
                <div className="stat">
                  <div className="stat-title">Hashrate (1m)</div>
                  <div className="stat-value text-3xl">
                    {formatHashrate(latestStats.hashrate1m)}
                  </div>
                  {renderPercentageChange('hashrate1m', 'worker.hashrates.1m')}
                </div>
              )}

              {isVisible('worker.hashrates.5m') && (
                <div className="stat">
                  <div className="stat-title">Hashrate (5m) </div>
                  <div className="stat-value text-3xl">
                    {formatHashrate(latestStats.hashrate5m)}
                  </div>
                  {renderPercentageChange('hashrate5m', 'worker.hashrates.5m')}
                </div>
              )}

              {isVisible('worker.hashrates.1hr') && (
                <div className="stat">
                  <div className="stat-title">Hashrate (1hr)</div>
                  <div className="stat-value text-3xl">
                    {formatHashrate(latestStats.hashrate1hr)}
                  </div>
                  {renderPercentageChange(
                    'hashrate1hr',
                    'worker.hashrates.1hr'
                  )}
                </div>
              )}
              {isVisible('worker.hashrates.1d') && (
                <div className="stat">
                  <div className="stat-title">Hashrate (1d)</div>
                  <div className="stat-value text-3xl">
                    {formatHashrate(latestStats.hashrate1d)}
                  </div>
                  {renderPercentageChange('hashrate1d', 'worker.hashrates.1d')}
                </div>
              )}
              {isVisible('worker.hashrates.7d') && (
                <div className="stat">
                  <div className="stat-title">Hashrate (7d)</div>
                  <div className="stat-value text-3xl">
                    {formatHashrate(latestStats.hashrate7d)}
                  </div>
                  {renderPercentageChange('hashrate7d', 'worker.hashrates.7d')}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {isVisible('worker.chart') && (
        <div className="mt-8">
          <UserStatsCharts userStats={worker.stats} />
        </div>
      )}
    </div>
  );
}
