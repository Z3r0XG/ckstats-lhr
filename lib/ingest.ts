/**
 * Multi-pool decoupled ingestion — CAPTURE half. Pulls each pool over a PERSISTENT keep-alive
 * connection (so the origin's slow TLS handshake is paid once, reused across cycles) and writes
 * normalized per-pool snapshot rows to SQL (the durable source of truth). The COMBINE half reads
 * those snapshots. See .local/multi-pool-decoupled-ingestion-design.md (FINAL MODEL).
 */
import 'reflect-metadata';
import { Agent } from 'undici';

import { getDb } from './db';
import {
  setPoolHealth,
  getPoolHealth,
  poolLabel,
  type PoolState,
} from './poolHealth';
import { persistCombinedPoolStats } from './poolStatsWrite';
import {
  getPoolUrls,
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

// ONE persistent keep-alive Agent for every pool origin (undici pools per-origin internally).
// Small connections-per-origin so we never stampede the origin's connection ceiling; long keepAlive
// so sockets survive across cycles. Built once, lives for the process.
let agent: Agent | undefined;
function getAgent(): Agent {
  if (!agent) {
    const conns = Number(process.env.POOL_MAX_CONNS) || 4;
    agent = new Agent({
      connections: conns,
      keepAliveTimeout: 10 * 60_000,
      keepAliveMaxTimeout: 10 * 60_000,
      pipelining: 1,
    });
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
 * Capture one pool: fetch its pool.status + every active user over the persistent connection, write
 * snapshot rows, and update the pool's health readout. Returns a small summary. Never throws — a
 * failed pool just leaves its existing (stale) snapshots in place and is marked accordingly.
 */
export async function capturePool(
  db: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
  pool: string,
  addresses: string[]
): Promise<{ pool: string; state: PoolState; users: number; workers: number }> {
  const dispatcher = getAgent();
  const now = new Date();

  // ---- pool.status ----
  let statusUsers = 0;
  let statusWorkers = 0;
  let hashrate5m = 0;
  let uptime = 0;
  const statusRes = await fetchPoolStatusFromPool(pool, dispatcher);
  if (statusRes.status === 'found') {
    const s = parsePoolStatus(statusRes.data);
    statusUsers = intOf(s.Users);
    statusWorkers = intOf(s.Workers);
    hashrate5m = hr(s.hashrate5m);
    uptime = intOf(s.runtime);
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
          user_agents: JSON.stringify(s.UserAgents ?? []),
          fetched_at: now,
        },
      ]
    );
  }
  const gotStatus = statusRes.status === 'found';

  // ---- per-user (fired together; the Agent caps concurrent sockets and reuses them) ----
  const userRows: Row[] = [];
  const workerRows: Row[] = [];
  const results = await Promise.all(
    addresses.map((address) => fetchUserFromPool(pool, address, dispatcher))
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
  setPoolHealth({
    pool,
    label: poolLabel(pool),
    lastUpdate: refreshed ? now.getTime() : (prev?.lastUpdate ?? null),
    uptimeSeconds: gotStatus ? uptime : (prev?.uptimeSeconds ?? 0),
    state,
    users: gotStatus ? statusUsers : (prev?.users ?? 0),
    workers: gotStatus ? statusWorkers : (prev?.workers ?? 0),
    hashrate5m: gotStatus ? hashrate5m : (prev?.hashrate5m ?? 0),
  });
  return { pool, state, users: userRows.length, workers: workerRows.length };
}

/** Capture every configured pool (each independent; one failing doesn't block the others). */
export async function captureAllPools(): Promise<
  Array<{ pool: string; state: PoolState; users: number; workers: number }>
> {
  const db = await getDb();
  const pools = getPoolUrls();
  const rows = (await db.query(
    'SELECT address FROM "User" WHERE "isActive" = true'
  )) as Array<{
    address: string;
  }>;
  const addresses = rows.map((r) => r.address);
  const out: Array<{
    pool: string;
    state: PoolState;
    users: number;
    workers: number;
  }> = [];
  for (const pool of pools) {
    out.push(await capturePool(db, pool, addresses));
  }
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

/**
 * Combine the latest stored snapshots and write the existing combined tables. The math ALWAYS uses
 * each pool's latest snapshot (stale or fresh, never zeroed). Reuses combinePoolStatus +
 * persistCombinedPoolStats for the pool view, and combineUserData + the existing updateUser write
 * path (grace/inactivity, WorkerStats, high-score booking) per user — so staleness behaves exactly
 * like the current single-pool model.
 */
export async function combineCycle(): Promise<{
  pools: number;
  users: number;
}> {
  const db = await getDb();

  const statusRows = (await db.query(
    'SELECT * FROM pool_status_snapshot'
  )) as Record<string, unknown>[];
  if (statusRows.length > 0) {
    const combined = combinePoolStatus(statusRows.map(rawStatusFromRow));
    await persistCombinedPoolStats(db as never, combined);
  }

  const userRows = (await db.query(
    'SELECT * FROM pool_user_snapshot'
  )) as Record<string, unknown>[];
  const workerRows = (await db.query(
    'SELECT * FROM pool_worker_snapshot'
  )) as Record<string, unknown>[];

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
  return { pools: statusRows.length, users: byAddress.size };
}

// ─── LOOP driver (started in-process from instrumentation.ts on server boot) ───────────────────

/** One full cycle: capture every pool over persistent connections, then combine into the DB. */
export async function runCycle(): Promise<{ pools: number; users: number }> {
  await captureAllPools();
  return combineCycle();
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
  console.log(`[ingest] starting in-process loop every ${intervalSec}s`);
  const tick = async () => {
    try {
      const r = await runCycle();
      console.log(`[ingest] cycle ok: ${r.pools} pools, ${r.users} users`);
    } catch (err) {
      console.error('[ingest] cycle error:', err);
    } finally {
      setTimeout(tick, intervalSec * 1000);
    }
  };
  void tick();
}
