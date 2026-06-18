/**
 * In-memory per-pool health/freshness for the multi-pool ingest loop, + the derived service-level
 * Health. HUMAN/ckstats-meta readout only — the combine math always uses each pool's latest stored
 * snapshot regardless of anything here.
 *
 * Two independent signals (see the design doc):
 *   - lastRuntimeAdvance → Pool HEALTH ("is the pool alive"): ckpool's `runtime` ticks every second
 *     it's alive, so if it advanced recently the pool is up (a fresh restart counts; a frozen/
 *     served-but-dead status does not). Miner-independent.
 *   - lastDataChange → "Last Update" ("did WE get new data"): ckpool's `accepted` (cumulative shares)
 *     is monotonic; if it changed, real mining data moved. All pools frozen → this stops advancing.
 *
 * Kept on a globalThis singleton (Symbol key) so the in-process loop and the request handlers /
 * server components share ONE instance in-process. Single-instance assumption.
 */
export type PoolState = 'ok' | 'stale' | 'error' | 'unknown';

export interface PoolHealth {
  pool: string; // the pool's configured URL/base (identity)
  label: string; // configured display label
  lastUpdate: number | null; // epoch ms of last SUCCESSFUL fetch (last *sync* / reachability)
  uptimeSeconds: number; // ckpool `runtime` from the last status (also the prev value for change-detect)
  acceptedTotal: number; // last `accepted` (cumulative) — prev value for data-change detection
  lastRuntimeAdvance: number | null; // epoch ms `runtime` last changed → drives Health liveness
  lastDataChange: number | null; // epoch ms `accepted` last changed → drives "Last Update"
  state: PoolState;
  users: number; // that pool's last-known pool.status contribution (for the panel)
  workers: number;
  hashrate5m: number;
}

export type ServiceHealthState = 'healthy' | 'degraded' | 'down' | 'unknown';

export interface ServiceHealth {
  state: ServiceHealthState;
  poolsUp: number;
  poolsTotal: number;
  lastDataChange: number | null; // most-recent data change across pools (epoch ms)
}

/** Service health + the per-pool list, for the dashboard payload / Status page (all serializable). */
export interface ServiceSnapshot extends ServiceHealth {
  pools: PoolHealth[];
}

const KEY = Symbol.for('ckstats.poolHealth');

function store(): Map<string, PoolHealth> {
  const g = globalThis as unknown as { [KEY]?: Map<string, PoolHealth> };
  if (!g[KEY]) g[KEY] = new Map<string, PoolHealth>();
  return g[KEY] as Map<string, PoolHealth>;
}

export function setPoolHealth(health: PoolHealth): void {
  store().set(health.pool, health);
}

/** Snapshot of all known pools' health, in insertion order (configured-pool order). */
export function getAllPoolHealth(): PoolHealth[] {
  return Array.from(store().values());
}

/** Current health for one pool (used by capture to detect change vs the previous cycle). */
export function getPoolHealth(pool: string): PoolHealth | undefined {
  return store().get(pool);
}

/**
 * Derived service Health (ckstats-meta): a pool is "up" if its `runtime` advanced within the
 * staleness window (default POOL_HEALTH_STALE_SECONDS or 300s). Healthy = all up, Down = none up,
 * Degraded = mixed. `lastDataChange` = the most-recent per-pool data change → "since new data".
 * Reachability/freshness is a ckstats concern, so it lives here (not in the ckpool pool stats).
 */
export function getServiceHealth(): ServiceHealth {
  const pools = getAllPoolHealth();
  if (pools.length === 0) {
    return {
      state: 'unknown',
      poolsUp: 0,
      poolsTotal: 0,
      lastDataChange: null,
    };
  }
  const windowMs =
    (Number(process.env.POOL_HEALTH_STALE_SECONDS) || 300) * 1000;
  const now = Date.now();
  let up = 0;
  let lastDataChange: number | null = null;
  for (const p of pools) {
    if (p.lastRuntimeAdvance != null && now - p.lastRuntimeAdvance < windowMs) {
      up++;
    }
    if (p.lastDataChange != null) {
      lastDataChange = Math.max(lastDataChange ?? 0, p.lastDataChange);
    }
  }
  const state: ServiceHealthState =
    up === pools.length ? 'healthy' : up === 0 ? 'down' : 'degraded';
  return { state, poolsUp: up, poolsTotal: pools.length, lastDataChange };
}

/** Service health + per-pool detail, for the dashboard payload and the Status page. */
export function getServiceSnapshot(): ServiceSnapshot {
  return { ...getServiceHealth(), pools: getAllPoolHealth() };
}
