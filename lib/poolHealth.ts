/**
 * In-memory per-pool freshness readout for the multi-pool ingest loop. This is a HUMAN READOUT only
 * — the combine math always uses each pool's latest stored snapshot regardless of what's here; this
 * just lets the UI's "Pools" panel show each pool's last-update / uptime / state.
 *
 * Kept on a globalThis singleton (keyed by a Symbol) so the in-process ingest loop (started from
 * instrumentation.ts) and the request handlers / server components share ONE instance even if Next
 * bundles the module into separate graphs. Single-process / single-instance assumption.
 */
export type PoolState = 'ok' | 'stale' | 'error' | 'unknown';

export interface PoolHealth {
  pool: string; // the pool's configured URL/base (identity)
  label: string; // friendly short label (e.g. "na" from api-btc-na.heliospool.com)
  lastUpdate: number | null; // epoch ms of the last SUCCESSFUL fetch (null = never since boot)
  uptimeSeconds: number; // runtime reported by that pool's last status
  state: PoolState;
  users: number; // that pool's last-known contribution (for the panel)
  workers: number;
  hashrate5m: number;
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

/** Current health for one pool (used by capture to preserve last-known on an unreachable cycle). */
export function getPoolHealth(pool: string): PoolHealth | undefined {
  return store().get(pool);
}
