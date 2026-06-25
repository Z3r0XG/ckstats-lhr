/**
 * In-memory per-pool health/freshness for the multi-pool ingest loop, + the derived service-level
 * Health. HUMAN/ckstats-meta readout only — the combine math always uses each pool's latest stored
 * snapshot regardless of anything here.
 *
 * Two independent signals:
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
  poolLastUpdate: number | null; // epoch ms of ckpool's OWN `lastupdate` (pool-side freshness, from
  // the fetched status — distinct from our fetch time; can't be fresher than `lastUpdate`)
  state: PoolState;
  users: number; // that pool's last-known pool.status contribution (for the Status page)
  workers: number;
  hashrate5m: number;
  bestShare: number; // last-known best diff (pool.status `bestshare`)
  sps5m: number; // last-known 5m shares-per-second (pool.status `SPS5m`)
  rejectedTotal: number; // last-known rejected diff (pool.status `rejected`)
  acceptedCount: number; // last-known accepted share count (pool.status `accepted_count`)
  rejectedCount: number; // last-known rejected share count (pool.status `rejected_count`)
}

export type ServiceHealthState = 'healthy' | 'degraded' | 'down' | 'unknown';

export interface ServiceHealth {
  state: ServiceHealthState;
  poolsUp: number;
  poolsTotal: number;
  lastDataChange: number | null; // most-recent data change across pools (epoch ms)
  poolLastUpdate: number | null; // STALEST ckpool lastupdate across pools (MIN = worst-case freshness)
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
 * Drop in-memory health for any pool not in `keep` (the currently-configured pools). Without this a
 * removed/renamed pool lingers in the map forever, so /status and the service Health count would
 * disagree with the combined stats (which only sum configured pools). No-op if `keep` is empty.
 */
export function prunePoolHealth(keep: string[]): void {
  if (keep.length === 0) return;
  const allow = new Set(keep);
  const m = store();
  for (const k of Array.from(m.keys())) {
    if (!allow.has(k)) m.delete(k);
  }
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
      poolLastUpdate: null,
    };
  }
  const windowMs =
    (Number(process.env.POOL_HEALTH_STALE_SECONDS) || 300) * 1000;
  const now = Date.now();
  let up = 0;
  let lastDataChange: number | null = null;
  // MIN (oldest) across pools so the combined readout reflects the stalest pool — if any one pool's
  // ckpool stopped updating, the aggregate freshness shows it rather than being masked by a fresh peer.
  let poolLastUpdate: number | null = null;
  for (const p of pools) {
    if (p.lastRuntimeAdvance != null && now - p.lastRuntimeAdvance < windowMs) {
      up++;
    }
    if (p.lastDataChange != null) {
      lastDataChange = Math.max(lastDataChange ?? 0, p.lastDataChange);
    }
    if (p.poolLastUpdate != null) {
      poolLastUpdate = Math.min(poolLastUpdate ?? Infinity, p.poolLastUpdate);
    }
  }
  const state: ServiceHealthState =
    up === pools.length ? 'healthy' : up === 0 ? 'down' : 'degraded';
  return {
    state,
    poolsUp: up,
    poolsTotal: pools.length,
    lastDataChange,
    poolLastUpdate,
  };
}

/** Service health + per-pool detail, for the dashboard payload and the Status page. */
export function getServiceSnapshot(): ServiceSnapshot {
  return { ...getServiceHealth(), pools: getAllPoolHealth() };
}
