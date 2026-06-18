import { getAllPoolHealth } from '../lib/poolHealth';

// Display thresholds (cosmetic only — never affect the math): a pool whose last successful pull is
// older than STALE_MS shows "stale"; the in-process loop runs ~every 60s.
const STALE_MS = 5 * 60 * 1000;

function ago(ms: number | null): string {
  if (!ms) return 'never';
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function uptime(sec: number): string {
  if (!sec) return '—';
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/**
 * Per-pool freshness/health readout for the combined multi-pool view. Reads the in-memory pool-health
 * singleton the ingest loop maintains (only populated when ingestion runs in this process). Shows
 * each pool's state, last update, and uptime — a human readout; the combined math always uses each
 * pool's latest stored snapshot regardless of what's shown here. Renders nothing for single-pool.
 */
export default function PoolsPanel() {
  const pools = getAllPoolHealth();
  if (pools.length <= 1) return null;

  return (
    <div className="card bg-base-200 shadow-lg my-4">
      <div className="card-body p-4">
        <h2 className="card-title text-lg">Pools ({pools.length})</h2>
        <div className="overflow-x-auto">
          <table className="table table-sm">
            <thead>
              <tr>
                <th>Pool</th>
                <th>Status</th>
                <th>Last Update</th>
                <th>Uptime</th>
                <th className="text-right">Users</th>
                <th className="text-right">Workers</th>
              </tr>
            </thead>
            <tbody>
              {pools.map((p) => {
                const stale =
                  p.state === 'error' ||
                  p.lastUpdate === null ||
                  Date.now() - p.lastUpdate > STALE_MS;
                const label =
                  p.state === 'error' ? 'down' : stale ? 'stale' : 'ok';
                const color =
                  label === 'ok'
                    ? 'badge-success'
                    : label === 'stale'
                      ? 'badge-warning'
                      : 'badge-error';
                return (
                  <tr key={p.pool}>
                    <td className="font-medium">{p.label}</td>
                    <td>
                      <span className={`badge ${color} badge-sm`}>{label}</span>
                    </td>
                    <td>{ago(p.lastUpdate)}</td>
                    <td>{uptime(p.uptimeSeconds)}</td>
                    <td className="text-right">{p.users.toLocaleString()}</td>
                    <td className="text-right">{p.workers.toLocaleString()}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
