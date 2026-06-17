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
import { getPoolUrls } from '../scripts/combine';
import {
  fetchUserFromPool,
  fetchPoolStatusFromPool,
} from '../scripts/fetchPools';
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
