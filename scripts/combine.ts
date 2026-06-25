/**
 * Multi-pool aggregation — PURE functions that merge N upstream ckpool pools into one combined
 * view. No I/O, no DB, no env beyond getPoolUrls(): unit-testable in isolation (this is where all
 * the sum/max/min/dedup rules live). "pool" = one upstream ckpool we aggregate; the combined output
 * feeds the PoolStats/Worker/UserStats tables.
 *
 * Outputs normalized NUMERIC shapes (hashrates in H/s) because ckpool reports unit-strings
 * ("73.4T") that can't round-trip cleanly; the ingest consumers store numbers anyway.
 */
import type { UserData } from './updateUsers';
import {
  convertHashrateFloat,
  safeParseFloat,
  parseWorkerName,
  normalizeUserAgent,
} from '../utils/helpers';

const hr = (v: unknown): number => convertHashrateFloat(String(v ?? '0'));

// ─── pool config ──────────────────────────────────────────────────────────────

export interface PoolSource {
  url: string; // http base OR local file root (resolved by the dual-mode fetch)
  label: string; // display name for the Status/Pools UI
}

/**
 * Generic, deployment-agnostic fallback label when an operator hasn't set one: the hostname for an
 * http URL, or the last path segment for a local file root. Operators set explicit labels via the
 * object form of API_URL (below) for clean names.
 */
function defaultPoolLabel(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    const parts = url.replace(/\/+$/, '').split('/');
    return parts[parts.length - 1] || url;
  }
}

/**
 * Ordered list of pools with display labels, parsed from `API_URL`. Two forms:
 *   - a single URL or local path:        `https://a`           (one pool)
 *   - a JSON array, for multiple pools of the same coin:
 *       strings:                         `["https://a","https://b"]`
 *       or {url,label} objects:          `[{"url":"https://a","label":"NA"}, ...]`
 * String entries get a generic fallback label; the object form sets explicit labels. Universal —
 * no assumptions about any particular host/naming scheme.
 */
export function getPoolSources(): PoolSource[] {
  const raw = (process.env.API_URL ?? '').trim();
  if (!raw) return [];
  // JSON array form (string entries or {url,label} objects) — multiple pools.
  if (raw.startsWith('[')) {
    try {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) {
        const out: PoolSource[] = [];
        const seen = new Set<string>();
        for (const el of arr) {
          let u = '';
          let label = '';
          if (typeof el === 'string') {
            u = el.trim();
            label = defaultPoolLabel(u);
          } else if (el && typeof el === 'object' && el.url) {
            u = String(el.url).trim();
            label = el.label ? String(el.label) : defaultPoolLabel(u);
          }
          // Skip blanks and duplicate URLs (a URL is the pool's identity; first occurrence wins).
          if (!u || seen.has(u)) continue;
          seen.add(u);
          out.push({ url: u, label });
        }
        return out;
      }
    } catch {
      /* malformed JSON — no pools */
    }
    return [];
  }
  // Single pool: a bare URL or local path.
  return [{ url: raw, label: defaultPoolLabel(raw) }];
}

/** Just the pool URLs (the fetch loops use these; labels come from getPoolSources). */
export function getPoolUrls(): string[] {
  return getPoolSources().map((s) => s.url);
}

// ─── per-user combine ─────────────────────────────────────────────────────────

export interface CombinedWorker {
  name: string;
  userAgent: string; // normalized token (matches Worker.userAgent / leaderboard grouping)
  userAgentRaw: string | null; // raw UA string (matches Worker.userAgentRaw)
  hashrate1m: number;
  hashrate5m: number;
  hashrate1hr: number;
  hashrate1d: number;
  hashrate7d: number;
  lastShare: number; // MAX across pools
  started: number; // MAX (most recent session start; 0 if connected to no pool)
  shares: number; // SUM
  bestShare: number; // MAX
  bestEver: number; // MAX
}

export interface CombinedUser {
  authorised: number; // MIN across pools (earliest join); 0 if none
  hashrate1m: number;
  hashrate5m: number;
  hashrate1hr: number;
  hashrate1d: number;
  hashrate7d: number;
  lastShare: number; // MAX
  workerCount: number; // distinct-union count (NOT sum of per-pool userData.workers)
  shares: number; // SUM
  bestShare: number; // MAX
  bestEver: number; // MAX
  workers: CombinedWorker[];
}

/**
 * Combine a user's data from each pool it was found on. Dedups workers by identity
 * (parseWorkerName), summing hashrate/shares and taking the max of best-ever/last-share, then
 * derives the user-level totals from the combined workers (so workerCount is the distinct count).
 */
export function combineUserData(
  pools: UserData[],
  address: string
): CombinedUser {
  const byName = new Map<string, CombinedWorker>();
  let authorised = 0;

  for (const pool of pools) {
    if (pool.authorised && pool.authorised > 0) {
      authorised = authorised
        ? Math.min(authorised, pool.authorised)
        : pool.authorised;
    }
    for (const w of pool.worker ?? []) {
      const name = parseWorkerName(w.workername, address);
      const lastShare = Number(w.lastshare ?? 0);
      const rawUa = (w.useragent ?? '').trim();
      const incoming = {
        hashrate1m: hr(w.hashrate1m),
        hashrate5m: hr(w.hashrate5m),
        hashrate1hr: hr(w.hashrate1hr),
        hashrate1d: hr(w.hashrate1d),
        hashrate7d: hr(w.hashrate7d),
        lastShare,
        started: Number(w.started ?? 0),
        shares: safeParseFloat(w.shares, 0),
        bestShare: safeParseFloat(w.bestshare, 0),
        bestEver: safeParseFloat(w.bestever, 0),
        userAgent: normalizeUserAgent(rawUa),
        userAgentRaw: rawUa || null,
      };

      const cur = byName.get(name);
      if (!cur) {
        byName.set(name, { name, ...incoming });
        continue;
      }
      cur.hashrate1m += incoming.hashrate1m;
      cur.hashrate5m += incoming.hashrate5m;
      cur.hashrate1hr += incoming.hashrate1hr;
      cur.hashrate1d += incoming.hashrate1d;
      cur.hashrate7d += incoming.hashrate7d;
      cur.shares += incoming.shares;
      cur.bestShare = Math.max(cur.bestShare, incoming.bestShare);
      cur.bestEver = Math.max(cur.bestEver, incoming.bestEver);
      cur.started = Math.max(cur.started, incoming.started);
      // last-share + the device/UA both come from the most-recently-active pool
      if (incoming.lastShare > cur.lastShare) {
        cur.lastShare = incoming.lastShare;
        cur.userAgent = incoming.userAgent;
        cur.userAgentRaw = incoming.userAgentRaw;
      }
    }
  }

  const workers = Array.from(byName.values());
  const sum = (k: keyof CombinedWorker) =>
    workers.reduce((a, w) => a + (w[k] as number), 0);
  const max = (k: keyof CombinedWorker) =>
    workers.reduce((a, w) => Math.max(a, w[k] as number), 0);

  return {
    authorised,
    hashrate1m: sum('hashrate1m'),
    hashrate5m: sum('hashrate5m'),
    hashrate1hr: sum('hashrate1hr'),
    hashrate1d: sum('hashrate1d'),
    hashrate7d: sum('hashrate7d'),
    lastShare: max('lastShare'),
    workerCount: workers.length,
    shares: sum('shares'),
    bestShare: max('bestShare'),
    bestEver: max('bestEver'),
    workers,
  };
}

// ─── pool-status combine ──────────────────────────────────────────────────────

/** Minimal raw pool.status shape this needs (subset of seed.ts PoolStatsData). */
export interface RawPoolStatus {
  runtime?: string | number;
  Users?: string | number;
  Workers?: string | number;
  Idle?: string | number;
  Disconnected?: string | number;
  hashrate1m?: string;
  hashrate5m?: string;
  hashrate15m?: string;
  hashrate1hr?: string;
  hashrate6hr?: string;
  hashrate1d?: string;
  hashrate7d?: string;
  diff?: string | number;
  netdiff?: string | number | null;
  accepted?: string | number;
  rejected?: string | number;
  accepted_count?: number;
  rejected_count?: number;
  bestshare?: string | number;
  SPS1m?: string | number;
  SPS5m?: string | number;
  SPS15m?: string | number;
  SPS1h?: string | number;
  UserAgents?: Array<{
    ua: string;
    devices: number;
    hashrate5m: string;
    bestshare?: number;
  }>;
}

export interface CombinedUserAgent {
  ua: string;
  devices: number; // SUM
  hashrate5m: number; // SUM
  bestshare: number; // MAX
}

export interface CombinedPoolStatus {
  runtime: number; // MAX (per-pool uptime; representative)
  users: number; // SUM of per-pool pool.status Users (pool-level metric, not gated by ckstats registration)
  workers: number; // SUM of per-pool pool.status Workers (ditto)
  idle: number; // SUM (approx — connection-state count; can over-count cross-pool)
  disconnected: number; // SUM (approx)
  hashrate1m: number;
  hashrate5m: number;
  hashrate15m: number;
  hashrate1hr: number;
  hashrate6hr: number;
  hashrate1d: number;
  hashrate7d: number;
  accepted: number; // SUM
  rejected: number; // SUM
  acceptedCount: number; // SUM
  rejectedCount: number; // SUM
  bestshare: number; // MAX
  netdiff: number | null; // identical across pools (same coin) → take first non-null
  diff: number; // representative → MAX (per-connection vardiff; not truly combinable)
  SPS1m: number;
  SPS5m: number;
  SPS15m: number;
  SPS1h: number;
  userAgents: CombinedUserAgent[];
  // NOTE: users/workers are SUMmed straight from pool.status (above) — they are pool-level metrics
  // that ckpool reports independently of ckstats user registration, so deriving them from the
  // ckstats DB (registration-gated) would drastically undercount. A wallet/worker active on 2+
  // pools is counted on each; that cross-pool overlap is the same transient over-count as the
  // failover hashrate SUM, and pool.status carries no identity to dedup on anyway.
}

/** Combine pool.status from each pool into one service-wide status. */
export function combinePoolStatus(pools: RawPoolStatus[]): CombinedPoolStatus {
  const sumHr = (k: keyof RawPoolStatus) =>
    pools.reduce((a, p) => a + hr(p[k]), 0);
  const sumNum = (k: keyof RawPoolStatus) =>
    pools.reduce((a, p) => a + safeParseFloat(p[k] as any, 0), 0);

  const uaMap = new Map<string, CombinedUserAgent>();
  for (const p of pools) {
    for (const u of p.UserAgents ?? []) {
      // Key on the normalized UA (same token as Worker.userAgent) so raw variants that collapse to
      // the same device merge into one entry. Fall back to the raw string if normalize is empty.
      const key = normalizeUserAgent(u.ua) || u.ua;
      const cur = uaMap.get(key);
      const devices = Number(u.devices ?? 0);
      const h5 = hr(u.hashrate5m);
      const best = Number(u.bestshare ?? 0);
      if (!cur) {
        uaMap.set(key, { ua: key, devices, hashrate5m: h5, bestshare: best });
      } else {
        cur.devices += devices;
        cur.hashrate5m += h5;
        cur.bestshare = Math.max(cur.bestshare, best);
      }
    }
  }

  const netPool = pools.find((p) => p.netdiff != null && p.netdiff !== '');
  const intSum = (k: keyof RawPoolStatus) =>
    pools.reduce((a, p) => a + (parseInt(String(p[k] ?? '0'), 10) || 0), 0);

  return {
    runtime: pools.reduce(
      (a, p) => Math.max(a, safeParseFloat(p.runtime as any, 0)),
      0
    ),
    users: intSum('Users'),
    workers: intSum('Workers'),
    idle: intSum('Idle'),
    disconnected: intSum('Disconnected'),
    hashrate1m: sumHr('hashrate1m'),
    hashrate5m: sumHr('hashrate5m'),
    hashrate15m: sumHr('hashrate15m'),
    hashrate1hr: sumHr('hashrate1hr'),
    hashrate6hr: sumHr('hashrate6hr'),
    hashrate1d: sumHr('hashrate1d'),
    hashrate7d: sumHr('hashrate7d'),
    accepted: sumNum('accepted'),
    rejected: sumNum('rejected'),
    acceptedCount: pools.reduce((a, p) => a + Number(p.accepted_count ?? 0), 0),
    rejectedCount: pools.reduce((a, p) => a + Number(p.rejected_count ?? 0), 0),
    bestshare: pools.reduce(
      (a, p) => Math.max(a, safeParseFloat(p.bestshare as any, 0)),
      0
    ),
    netdiff: netPool ? safeParseFloat(netPool.netdiff as any, 0) : null,
    diff: pools.reduce(
      (a, p) => Math.max(a, safeParseFloat(p.diff as any, 0)),
      0
    ),
    SPS1m: sumNum('SPS1m'),
    SPS5m: sumNum('SPS5m'),
    SPS15m: sumNum('SPS15m'),
    SPS1h: sumNum('SPS1h'),
    userAgents: Array.from(uaMap.values()),
  };
}
