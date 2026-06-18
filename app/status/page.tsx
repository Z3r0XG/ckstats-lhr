import { getServiceSnapshot } from '../../lib/poolHealth';
import {
  formatDuration,
  formatHashrate,
  formatNumber,
  formatTimeAgo,
} from '../../utils/helpers';

// In-memory pool health is request-time state — never cache this page.
export const dynamic = 'force-dynamic';

const STALE_MS = (Number(process.env.POOL_HEALTH_STALE_SECONDS) || 300) * 1000;

export default function StatusPage() {
  const { state, poolsUp, poolsTotal, pools } = getServiceSnapshot();
  const now = Date.now();

  const serviceBadge =
    state === 'healthy'
      ? 'badge-success'
      : state === 'degraded'
        ? 'badge-warning'
        : state === 'down'
          ? 'badge-error'
          : 'badge-ghost';

  return (
    <main className="container mx-auto p-4">
      <div className="flex items-center gap-3 mb-4">
        <h1 className="text-2xl font-bold">Pool Status</h1>
        <span className={`badge ${serviceBadge}`}>
          {state === 'unknown' ? 'N/A' : state}
        </span>
        {poolsTotal > 0 && (
          <span className="text-sm text-base-content/60">
            {poolsUp}/{poolsTotal} pools up
          </span>
        )}
      </div>

      {pools.length === 0 ? (
        <p className="text-base-content/60">
          No per-pool data — ingestion isn&apos;t running in this instance.
        </p>
      ) : (
        <div className="card bg-base-100 shadow-xl card-compact">
          <div className="card-body overflow-x-auto">
            <table className="table table-sm sm:table-md w-full">
              <thead>
                <tr>
                  <th>Pool</th>
                  <th>Status</th>
                  <th>Uptime</th>
                  <th>Last Sync</th>
                  <th>Last Data</th>
                  <th className="text-right">Users</th>
                  <th className="text-right">Workers</th>
                  <th className="text-right">Hashrate (5m)</th>
                </tr>
              </thead>
              <tbody>
                {pools.map((p) => {
                  // Alive = ckpool runtime advanced within the staleness window (miner-independent).
                  const alive =
                    p.lastRuntimeAdvance != null &&
                    now - p.lastRuntimeAdvance < STALE_MS;
                  const badge = alive ? 'badge-success' : 'badge-error';
                  return (
                    <tr key={p.pool}>
                      <td className="font-medium">{p.label}</td>
                      <td>
                        <span className={`badge ${badge} badge-sm`}>
                          {alive ? 'up' : 'down'}
                        </span>
                      </td>
                      <td>
                        {p.uptimeSeconds
                          ? formatDuration(p.uptimeSeconds)
                          : '—'}
                      </td>
                      <td>
                        {p.lastUpdate
                          ? formatTimeAgo(new Date(p.lastUpdate))
                          : 'never'}
                      </td>
                      <td>
                        {p.lastDataChange
                          ? formatTimeAgo(new Date(p.lastDataChange))
                          : 'never'}
                      </td>
                      <td className="text-right">{formatNumber(p.users)}</td>
                      <td className="text-right">{formatNumber(p.workers)}</td>
                      <td className="text-right">
                        {formatHashrate(p.hashrate5m)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </main>
  );
}
