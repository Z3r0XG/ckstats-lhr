/**
 * Multi-pool decoupled ingestion — CAPTURE half. Pulls each pool over a PERSISTENT keep-alive
 * connection (so the origin's slow TLS handshake is paid once, reused across cycles) and writes
 * normalized per-pool snapshot rows to SQL (the durable source of truth). The COMBINE half reads
 * those snapshots and writes the combined dashboard tables.
 */
import 'reflect-metadata';
import { Agent } from 'undici';

import { getDb } from './db';
import {
  setPoolHealth,
  getPoolHealth,
  prunePoolHealth,
  type PoolState,
} from './poolHealth';
import { persistCombinedPoolStats } from './poolStatsWrite';
import { cleanOldStats } from '../scripts/cleanOldStats';
import {
  getPoolSources,
  combinePoolStatus,
  combineUserData,
  type RawPoolStatus,
} from '../scripts/combine';
import {
  fetchUserFromPool,
  fetchPoolStatusFromPool,
} from '../scripts/fetchPools';
import {
  updateUser,
  type UserData,
  type MessageCollectors,
} from '../scripts/updateUsers';
import {
  convertHashrateFloat,
  safeParseFloat,
  parseWorkerName,
  normalizeUserAgent,
} from '../utils/helpers';

const hr = (v: unknown): number => convertHashrateFloat(String(v ?? '0'));
const intOf = (v: unknown): number => Math.trunc(safeParseFloat(v as never, 0));

// Persistent keep-alive Agent per pool origin (undici pools per-origin internally), so the slow TLS
// handshake is paid once and reused across cycles. All connection settings are env-tunable (friendly
// seconds → ms); a non-negative number overrides, anything else uses the default.
function envSeconds(name: string, dflt: number): number {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v >= 0 ? v : dflt;
}

function buildAgent(): Agent {
  // Idle keep-alive timeout. Kept SHORTER than typical origin/proxy idle timeouts (nginx ~75s,
  // many LBs/NATs 30–60s) so WE refresh first and never reuse a socket the server already closed —
  // and shorter than the poll interval, so connections stay warm within a cycle's burst but are
  // re-established between cycles rather than lingering long enough to be silently reaped.
  const keepAliveMs = envSeconds('API_KEEPALIVE_TIMEOUT_SECONDS', 30) * 1000;
  // Response wait cap (opt-in) — only applied when API_REQUEST_TIMEOUT_SECONDS is set; otherwise
  // undici's own defaults apply (matches the request-level AbortSignal, also opt-in).
  const reqSec = Number(process.env.API_REQUEST_TIMEOUT_SECONDS);
  const reqTimeoutMs =
    Number.isFinite(reqSec) && reqSec > 0 ? reqSec * 1000 : 0;
  const tcpKaSec = envSeconds('API_TCP_KEEPALIVE_SECONDS', 30);
  return new Agent({
    connections: Number(process.env.API_MAX_CONNS) || 4,
    keepAliveTimeout: keepAliveMs,
    keepAliveMaxTimeout: keepAliveMs,
    pipelining: 1,
    ...(reqTimeoutMs > 0
      ? { headersTimeout: reqTimeoutMs, bodyTimeout: reqTimeoutMs }
      : {}),
    connect: {
      timeout: envSeconds('API_CONNECT_TIMEOUT_SECONDS', 5) * 1000,
      // OS-level TCP keepalive probes (separate from HTTP keep-alive) so a dead peer is noticed
      // without waiting on a request timeout. 0 disables.
      ...(tcpKaSec > 0
        ? { keepAlive: true, keepAliveInitialDelay: tcpKaSec * 1000 }
        : {}),
    },
  });
}

let agent: Agent | undefined;
function getAgent(): Agent {
  if (!agent) {
    agent = buildAgent();
    // undici has no native max-connection-age, so a long-lived socket silently reaped by a NAT /
    // firewall can wedge a pool indefinitely (half-open: writes black-holed, no error). Bound the
    // age by periodically swapping in a fresh Agent and closing the old one OFF the fetch path
    // (fire-and-forget) — fetches keep using warm connections, and a wedged socket self-heals within
    // API_CONN_MAX_AGE_SECONDS instead of never. 0 disables rotation.
    const ageMs = envSeconds('API_CONN_MAX_AGE_SECONDS', 300) * 1000;
    if (ageMs > 0) {
      const timer = setInterval(() => {
        const old = agent;
        agent = buildAgent();
        void old?.close().catch(() => void old?.destroy().catch(() => {}));
      }, ageMs);
      timer.unref?.();
    }
  }
  return agent;
}

function parsePoolStatus(text: string): Record<string, unknown> {
  return text
    .split('\n')
    .filter(Boolean)
    .reduce(
      (acc, line) => ({ ...acc, ...JSON.parse(line) }),
      {} as Record<string, unknown>
    );
}

type Row = Record<string, unknown>;

/** Batched multi-row upsert (chunked to stay under the param cap). */
async function batchUpsert(
  db: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
  table: string,
  columns: string[],
  conflict: string[],
  rows: Row[]
): Promise<void> {
  if (rows.length === 0) return;
  const updateCols = columns.filter((c) => !conflict.includes(c));
  const setSql = updateCols.map((c) => `"${c}"=EXCLUDED."${c}"`).join(', ');
  const colSql = columns.map((c) => `"${c}"`).join(', ');
  const CHUNK = 400;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const params: unknown[] = [];
    const valuesSql = chunk
      .map((row) => {
        const base = params.length;
        columns.forEach((c) => params.push(row[c]));
        return `(${columns.map((_c, j) => `$${base + j + 1}`).join(', ')})`;
      })
      .join(', ');
    await db.query(
      `INSERT INTO "${table}" (${colSql}) VALUES ${valuesSql}
       ON CONFLICT (${conflict.map((c) => `"${c}"`).join(', ')}) DO UPDATE SET ${setSql}`,
      params
    );
  }
}

const USER_COLS = [
  'pool',
  'address',
  'hashrate1m',
  'hashrate5m',
  'hashrate1hr',
  'hashrate1d',
  'hashrate7d',
  'last_share',
  'authorised',
  'shares',
  'best_share',
  'best_ever',
  'worker_count',
  'fetched_at',
];
const WORKER_COLS = [
  'pool',
  'address',
  'worker_name',
  'hashrate1m',
  'hashrate5m',
  'hashrate1hr',
  'hashrate1d',
  'hashrate7d',
  'last_share',
  'started',
  'shares',
  'best_share',
  'best_ever',
  'device',
  'device_raw',
  'fetched_at',
];

/**
 * Capture one pool over the persistent connection and update its health readout. `mode` selects
 * which endpoints are hit — they're different resources (pool.status vs users/<addr>), so the two
 * halves never re-fetch each other's data:
 *   'status' = pool.status only (pool-stats half — what the `seed` cron drives)
 *   'users'  = active users only (what the `update-users` cron drives)
 *   'both'   = the full cycle (internal loop / `pnpm ingest`)
 * Never throws — an unreachable pool keeps its last-known snapshot and is marked accordingly.
 */
export async function capturePool(
  db: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
  pool: string,
  label: string,
  addresses: string[],
  mode: 'status' | 'users' | 'both' = 'both'
): Promise<{ pool: string; state: PoolState; users: number; workers: number }> {
  const dispatcher = getAgent();
  const now = new Date();

  // ---- pool.status (skipped in users-only mode) ----
  let statusUsers = 0;
  let statusWorkers = 0;
  let hashrate5m = 0;
  let uptime = 0;
  let poolLastUpdate = 0; // ckpool's own `lastupdate` (epoch SECONDS); 0 = not reported
  let acceptedTotal = 0;
  let bestShare = 0;
  let sps5m = 0;
  let rejectedTotal = 0;
  let acceptedCount = 0;
  let rejectedCount = 0;
  const statusRes =
    mode === 'users' ? null : await fetchPoolStatusFromPool(pool, dispatcher);
  if (statusRes && statusRes.status === 'found') {
    const s = parsePoolStatus(statusRes.data);
    statusUsers = intOf(s.Users);
    statusWorkers = intOf(s.Workers);
    hashrate5m = hr(s.hashrate5m);
    uptime = intOf(s.runtime);
    poolLastUpdate = intOf(s.lastupdate);
    acceptedTotal = safeParseFloat(s.accepted as never, 0);
    bestShare = safeParseFloat(s.bestshare as never, 0);
    sps5m = safeParseFloat(s.SPS5m as never, 0);
    rejectedTotal = safeParseFloat(s.rejected as never, 0);
    acceptedCount = intOf(s.accepted_count);
    rejectedCount = intOf(s.rejected_count);
    await batchUpsert(
      db,
      'pool_status_snapshot',
      [
        'pool',
        'users',
        'workers',
        'idle',
        'disconnected',
        'hashrate1m',
        'hashrate5m',
        'hashrate15m',
        'hashrate1hr',
        'hashrate6hr',
        'hashrate1d',
        'hashrate7d',
        'accepted',
        'rejected',
        'accepted_count',
        'rejected_count',
        'bestshare',
        'netdiff',
        'diff',
        'sps1m',
        'sps5m',
        'sps15m',
        'sps1h',
        'runtime',
        'lastupdate',
        'user_agents',
        'fetched_at',
      ],
      ['pool'],
      [
        {
          pool,
          users: statusUsers,
          workers: statusWorkers,
          idle: intOf(s.Idle),
          disconnected: intOf(s.Disconnected),
          hashrate1m: hr(s.hashrate1m),
          hashrate5m,
          hashrate15m: hr(s.hashrate15m),
          hashrate1hr: hr(s.hashrate1hr),
          hashrate6hr: hr(s.hashrate6hr),
          hashrate1d: hr(s.hashrate1d),
          hashrate7d: hr(s.hashrate7d),
          accepted: safeParseFloat(s.accepted as never, 0),
          rejected: safeParseFloat(s.rejected as never, 0),
          accepted_count: intOf(s.accepted_count),
          rejected_count: intOf(s.rejected_count),
          bestshare: safeParseFloat(s.bestshare as never, 0),
          netdiff:
            s.netdiff != null && s.netdiff !== ''
              ? safeParseFloat(s.netdiff as never, 0)
              : null,
          diff: safeParseFloat(s.diff as never, 0),
          sps1m: safeParseFloat(s.SPS1m as never, 0),
          sps5m: safeParseFloat(s.SPS5m as never, 0),
          sps15m: safeParseFloat(s.SPS15m as never, 0),
          sps1h: safeParseFloat(s.SPS1h as never, 0),
          runtime: uptime,
          lastupdate: poolLastUpdate,
          user_agents: JSON.stringify(s.UserAgents ?? []),
          fetched_at: now,
        },
      ]
    );
  }
  const gotStatus = statusRes?.status === 'found';

  // ---- per-user (skipped in status-only mode; users are a different endpoint than pool.status) ----
  const userRows: Row[] = [];
  const workerRows: Row[] = [];
  const targets = mode === 'status' ? [] : addresses;
  const results = await Promise.all(
    targets.map((address) => fetchUserFromPool(pool, address, dispatcher))
  );
  results.forEach((r, i) => {
    if (r.status !== 'found') return;
    const address = addresses[i];
    const u = r.data as unknown as Record<string, unknown> & {
      worker?: Record<string, unknown>[];
    };
    userRows.push({
      pool,
      address,
      hashrate1m: hr(u.hashrate1m),
      hashrate5m: hr(u.hashrate5m),
      hashrate1hr: hr(u.hashrate1hr),
      hashrate1d: hr(u.hashrate1d),
      hashrate7d: hr(u.hashrate7d),
      last_share: intOf(u.lastshare),
      authorised: intOf(u.authorised),
      shares: safeParseFloat(u.shares as never, 0),
      best_share: safeParseFloat(u.bestshare as never, 0),
      best_ever: safeParseFloat(u.bestever as never, 0),
      worker_count: intOf(u.workers ?? u.worker?.length ?? 0),
      fetched_at: now,
    });
    for (const w of u.worker ?? []) {
      const rawUa = String(w.useragent ?? '').trim();
      workerRows.push({
        pool,
        address,
        worker_name: parseWorkerName(String(w.workername ?? ''), address),
        hashrate1m: hr(w.hashrate1m),
        hashrate5m: hr(w.hashrate5m),
        hashrate1hr: hr(w.hashrate1hr),
        hashrate1d: hr(w.hashrate1d),
        hashrate7d: hr(w.hashrate7d),
        last_share: intOf(w.lastshare),
        started: intOf(w.started),
        shares: safeParseFloat(w.shares as never, 0),
        best_share: safeParseFloat(w.bestshare as never, 0),
        best_ever: safeParseFloat(w.bestever as never, 0),
        device: normalizeUserAgent(rawUa),
        device_raw: rawUa || null,
        fetched_at: now,
      });
    }
  });

  await batchUpsert(
    db,
    'pool_user_snapshot',
    USER_COLS,
    ['pool', 'address'],
    userRows
  );
  await batchUpsert(
    db,
    'pool_worker_snapshot',
    WORKER_COLS,
    ['pool', 'address', 'worker_name'],
    workerRows
  );

  // A cycle "refreshed" the pool if we got its status OR any of its users. If unreachable, keep the
  // last-known readout (so the panel shows last-update climbing) and mark it error. "stale" is NOT
  // set here — it's derived at render time from how old lastUpdate is. Individual per-user errors
  // don't flip the pool; only a wholly-unreachable pool does.
  const refreshed = gotStatus || userRows.length > 0;
  const prev = getPoolHealth(pool);
  const state: PoolState = refreshed ? 'ok' : 'error';
  const t = now.getTime();
  // Liveness (Health): runtime advanced this cycle (changed vs prev → alive; first cycle counts).
  const runtimeAdvanced = gotStatus && (!prev || uptime !== prev.uptimeSeconds);
  // Data freshness (Last Update): cumulative accepted shares changed this cycle.
  const dataChanged =
    gotStatus && (!prev || acceptedTotal !== prev.acceptedTotal);
  setPoolHealth({
    pool,
    label,
    lastUpdate: refreshed ? t : (prev?.lastUpdate ?? null),
    uptimeSeconds: gotStatus ? uptime : (prev?.uptimeSeconds ?? 0),
    acceptedTotal: gotStatus ? acceptedTotal : (prev?.acceptedTotal ?? 0),
    lastRuntimeAdvance: runtimeAdvanced
      ? t
      : (prev?.lastRuntimeAdvance ?? null),
    lastDataChange: dataChanged ? t : (prev?.lastDataChange ?? null),
    // ckpool's self-reported freshness (seconds → ms). Keep last-known if this cycle missed status.
    poolLastUpdate:
      gotStatus && poolLastUpdate > 0
        ? poolLastUpdate * 1000
        : (prev?.poolLastUpdate ?? null),
    state,
    users: gotStatus ? statusUsers : (prev?.users ?? 0),
    workers: gotStatus ? statusWorkers : (prev?.workers ?? 0),
    hashrate5m: gotStatus ? hashrate5m : (prev?.hashrate5m ?? 0),
    bestShare: gotStatus ? bestShare : (prev?.bestShare ?? 0),
    sps5m: gotStatus ? sps5m : (prev?.sps5m ?? 0),
    rejectedTotal: gotStatus ? rejectedTotal : (prev?.rejectedTotal ?? 0),
    acceptedCount: gotStatus ? acceptedCount : (prev?.acceptedCount ?? 0),
    rejectedCount: gotStatus ? rejectedCount : (prev?.rejectedCount ?? 0),
  });
  return { pool, state, users: userRows.length, workers: workerRows.length };
}

/**
 * Delete snapshot/source rows for pools that are no longer configured, so an old pool's stale data
 * stops being summed into the combined stats. No-op if nothing is configured (never wipe blindly).
 */
async function pruneOrphanSnapshots(
  db: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
  keep: string[]
): Promise<void> {
  if (keep.length === 0) return;
  const inSql = keep.map((_v, i) => `$${i + 1}`).join(', ');
  const tables = [
    'pool_status_snapshot',
    'pool_user_snapshot',
    'pool_worker_snapshot',
    'pool_source_status',
  ];
  for (const t of tables) {
    await db.query(`DELETE FROM "${t}" WHERE "pool" NOT IN (${inSql})`, keep);
  }
}

/** Capture every configured pool (each independent; one failing doesn't block the others). `mode`
 *  passes through to capturePool — 'status'/'users'/'both'. */
export async function captureAllPools(
  mode: 'status' | 'users' | 'both' = 'both'
): Promise<
  Array<{ pool: string; state: PoolState; users: number; workers: number }>
> {
  const db = await getDb();
  const sources = getPoolSources();
  // Active addresses are only needed when capturing users.
  const addresses =
    mode === 'status'
      ? []
      : (
          (await db.query(
            'SELECT address FROM "User" WHERE "isActive" = true'
          )) as Array<{ address: string }>
        ).map((r) => r.address);
  const out: Array<{
    pool: string;
    state: PoolState;
    users: number;
    workers: number;
  }> = [];
  for (const src of sources) {
    out.push(await capturePool(db, src.url, src.label, addresses, mode));
  }
  // Keep the in-memory map and the snapshot tables aligned with the configured pool set.
  const keep = sources.map((s) => s.url);
  prunePoolHealth(keep);
  await pruneOrphanSnapshots(db, keep);
  return out;
}

// ─── COMBINE half: read latest snapshots → write the existing combined tables ──────────────────

/** Reconstruct a RawPoolStatus from a pool_status_snapshot row (values already numeric; the
 *  combine helpers tolerate numbers, and user_agents is the raw UA list stored as JSON). */
function rawStatusFromRow(r: Record<string, unknown>): RawPoolStatus {
  let uas: unknown = r.user_agents;
  if (typeof uas === 'string') {
    try {
      uas = JSON.parse(uas);
    } catch {
      uas = [];
    }
  }
  return {
    runtime: r.runtime as number,
    Users: r.users as number,
    Workers: r.workers as number,
    Idle: r.idle as number,
    Disconnected: r.disconnected as number,
    hashrate1m: r.hashrate1m as never,
    hashrate5m: r.hashrate5m as never,
    hashrate15m: r.hashrate15m as never,
    hashrate1hr: r.hashrate1hr as never,
    hashrate6hr: r.hashrate6hr as never,
    hashrate1d: r.hashrate1d as never,
    hashrate7d: r.hashrate7d as never,
    accepted: r.accepted as number,
    rejected: r.rejected as number,
    accepted_count: r.accepted_count as number,
    rejected_count: r.rejected_count as number,
    bestshare: r.bestshare as number,
    netdiff: r.netdiff as number,
    diff: r.diff as number,
    SPS1m: r.sps1m as number,
    SPS5m: r.sps5m as number,
    SPS15m: r.sps15m as number,
    SPS1h: r.sps1h as number,
    UserAgents: Array.isArray(uas) ? (uas as RawPoolStatus['UserAgents']) : [],
  };
}

/** Reconstruct a per-pool UserData from a user snapshot row + its worker snapshot rows. Numeric
 *  fields round-trip through combineUserData's parsers unchanged; worker_name is already resolved. */
function userDataFromRows(
  u: Record<string, unknown>,
  workers: Record<string, unknown>[]
): UserData {
  return {
    authorised: u.authorised,
    lastshare: u.last_share,
    workers: u.worker_count,
    hashrate1m: u.hashrate1m,
    hashrate5m: u.hashrate5m,
    hashrate1hr: u.hashrate1hr,
    hashrate1d: u.hashrate1d,
    hashrate7d: u.hashrate7d,
    shares: u.shares,
    bestshare: u.best_share,
    bestever: u.best_ever,
    worker: workers.map((w) => ({
      workername: w.worker_name,
      useragent: w.device_raw ?? '',
      hashrate1m: w.hashrate1m,
      hashrate5m: w.hashrate5m,
      hashrate1hr: w.hashrate1hr,
      hashrate1d: w.hashrate1d,
      hashrate7d: w.hashrate7d,
      lastshare: w.last_share,
      started: w.started,
      shares: w.shares,
      bestshare: w.best_share,
      bestever: w.best_ever,
    })),
  } as unknown as UserData;
}

/** Read a snapshot table filtered to currently-configured pools, so a stray orphan row can never
 *  inflate the combined output. The combine math always uses each pool's latest snapshot (stale or
 *  fresh, never zeroed), reusing combinePoolStatus / combineUserData + the shared updateUser path. */
async function configuredSnapshotRows(
  db: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
  table: string
): Promise<Record<string, unknown>[]> {
  // Only ever combine pools that are currently configured. Orphan rows are normally pruned at
  // capture, but filter here too so a stray row can never inflate the combined totals.
  const configured = new Set(getPoolSources().map((s) => s.url));
  const rows = (await db.query(`SELECT * FROM ${table}`)) as Record<
    string,
    unknown
  >[];
  return rows.filter((r) => configured.has(r.pool as string));
}

/** Combine the latest pool.status snapshots into the combined PoolStats / online_devices tables
 *  (the pool-stats half). Always uses each pool's latest snapshot (stale or fresh, never zeroed). */
export async function combinePoolStatsCycle(): Promise<{ pools: number }> {
  const db = await getDb();
  const statusRows = await configuredSnapshotRows(db, 'pool_status_snapshot');
  if (statusRows.length > 0) {
    const combined = combinePoolStatus(statusRows.map(rawStatusFromRow));
    await persistCombinedPoolStats(db as never, combined);
  }
  return { pools: statusRows.length };
}

/** Combine the latest user/worker snapshots into per-user UserStats/Worker via the shared updateUser
 *  write path (grace/inactivity, high-score booking) — the users half. */
export async function combineUsersCycle(): Promise<{ users: number }> {
  const db = await getDb();

  const userRows = await configuredSnapshotRows(db, 'pool_user_snapshot');
  const workerRows = await configuredSnapshotRows(db, 'pool_worker_snapshot');

  const workersByKey = new Map<string, Record<string, unknown>[]>();
  for (const w of workerRows) {
    const key = `${w.pool} ${w.address}`;
    const list = workersByKey.get(key);
    if (list) list.push(w);
    else workersByKey.set(key, [w]);
  }

  const byAddress = new Map<string, UserData[]>();
  for (const u of userRows) {
    const ws = workersByKey.get(`${u.pool} ${u.address}`) ?? [];
    const ud = userDataFromRows(u, ws);
    const list = byAddress.get(u.address as string);
    if (list) list.push(ud);
    else byAddress.set(u.address as string, [ud]);
  }

  const messages: MessageCollectors = {
    gracePeriod: [],
    success: [],
    deactivations: [],
    errors: [],
  };
  for (const [address, perPool] of Array.from(byAddress.entries())) {
    const combined = combineUserData(perPool, address);
    await updateUser(address, messages, combined);
  }
  // Surface the per-user state changes to the server log (→ systemd journal) the way the old
  // update-users cron did. Summary line always when there's anything notable; deactivations and
  // errors printed in full (infrequent, worth seeing), grace kept to a count to avoid flooding.
  const deactivations = messages.deactivations ?? [];
  const gracePeriod = messages.gracePeriod ?? [];
  const errors = messages.errors ?? [];
  if (deactivations.length || errors.length || gracePeriod.length) {
    console.log(
      `[ingest] users: ${deactivations.length} deactivated, ${gracePeriod.length} in grace, ${errors.length} error(s)`
    );
    for (const m of deactivations) console.log(`[ingest] ${m}`);
    for (const m of errors) console.error(`[ingest] ${m}`);
  }
  return { users: byAddress.size };
}

/** Combine both halves (pool stats + users) from the stored snapshots. */
export async function combineCycle(): Promise<{
  pools: number;
  users: number;
}> {
  const { pools } = await combinePoolStatsCycle();
  const { users } = await combineUsersCycle();
  return { pools, users };
}

// ─── LOOP driver (started in-process from instrumentation.ts on server boot) ───────────────────

/** Pool-stats half: capture every pool's pool.status, then combine pool stats (the `seed` cron). */
export async function runStatsCycle(): Promise<{ pools: number }> {
  await captureAllPools('status');
  return combinePoolStatsCycle();
}

/** Users half: capture every pool's active users, then combine user stats (`update-users` cron). */
export async function runUsersCycle(): Promise<{ users: number }> {
  await captureAllPools('users');
  return combineUsersCycle();
}

/** Full cycle: capture both halves over persistent connections, then combine into the DB. Used by
 *  `pnpm ingest` and the internal loop. */
export async function runCycle(): Promise<{ pools: number; users: number }> {
  await captureAllPools('both');
  return combineCycle();
}

/**
 * Seed the in-memory health map from the stored snapshots on boot, so /status and the service
 * Health badge reflect every known pool immediately instead of only pools captured since this
 * process started. `fetched_at` seeds both liveness markers: a pool whose last snapshot is recent
 * reads "up", a long-stale one reads "down" — until the next live capture corrects it. Only
 * currently-configured pools are seeded.
 */
export async function rehydrateHealth(): Promise<void> {
  const db = await getDb();
  const sources = getPoolSources();
  const labelByUrl = new Map(sources.map((s) => [s.url, s.label]));
  const configured = new Set(sources.map((s) => s.url));
  const rows = (await db.query('SELECT * FROM pool_status_snapshot')) as Record<
    string,
    unknown
  >[];
  for (const r of rows) {
    const pool = r.pool as string;
    if (!configured.has(pool)) continue;
    const fetchedMs = r.fetched_at
      ? new Date(r.fetched_at as string).getTime()
      : null;
    setPoolHealth({
      pool,
      label: labelByUrl.get(pool) ?? pool,
      lastUpdate: fetchedMs,
      uptimeSeconds: Number(r.runtime ?? 0),
      acceptedTotal: Number(r.accepted ?? 0),
      lastRuntimeAdvance: fetchedMs,
      lastDataChange: fetchedMs,
      poolLastUpdate:
        Number(r.lastupdate ?? 0) > 0 ? Number(r.lastupdate) * 1000 : null,
      state: 'ok',
      users: Number(r.users ?? 0),
      workers: Number(r.workers ?? 0),
      hashrate5m: Number(r.hashrate5m ?? 0),
      bestShare: Number(r.bestshare ?? 0),
      sps5m: Number(r.sps5m ?? 0),
      rejectedTotal: Number(r.rejected ?? 0),
      acceptedCount: Number(r.accepted_count ?? 0),
      rejectedCount: Number(r.rejected_count ?? 0),
    });
  }
}

let loopStarted = false;

/**
 * Start the in-process ingest loop. Idempotent. Uses setTimeout-after-completion (not setInterval)
 * so cycles never overlap. Errors are swallowed per-cycle — ingestion must never crash the server.
 */
export function startIngestLoop(): void {
  if (loopStarted) return;
  loopStarted = true;
  const intervalSec = Number(process.env.POOL_INGEST_INTERVAL_SECONDS) || 60;
  // Default 7200s (2h) matches the README's recommended `cleanup` cron cadence.
  const cleanupSec = Number(process.env.POOL_CLEANUP_INTERVAL_SECONDS) || 7200;
  let lastCleanup = Date.now();
  console.log(
    `[ingest] starting in-process loop every ${intervalSec}s (cleanup every ${cleanupSec}s)`
  );
  const tick = async () => {
    try {
      const r = await runCycle();
      console.log(`[ingest] cycle ok: ${r.pools} pools, ${r.users} users`);
      // Prune the time-series tables on a slow cadence — folds the old `cleanup` cron into the loop
      // so the single process does everything (snapshots are bounded and not pruned here).
      if (Date.now() - lastCleanup >= cleanupSec * 1000) {
        lastCleanup = Date.now();
        await cleanOldStats();
      }
    } catch (err) {
      console.error('[ingest] cycle error:', err);
    } finally {
      setTimeout(tick, intervalSec * 1000);
    }
  };
  // Seed from stored snapshots first so the UI shows all known pools before the first live cycle.
  void (async () => {
    try {
      await rehydrateHealth();
    } catch (err) {
      console.error('[ingest] rehydrate error:', err);
    }
    void tick();
  })();
}
