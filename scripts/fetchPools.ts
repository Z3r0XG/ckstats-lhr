/**
 * Multi-pool fetch layer: fetch one upstream pool (http OR local file) and CLASSIFY the outcome so
 * the combine + inactivity logic can reason about it. See multi-region-combine-plan.md.
 *
 * Classification (the same buckets drive stats, inactivity, and high-score):
 *   - found  : we have this pool's data
 *   - absent : the user/pool genuinely isn't on this pool (HTTP 404 or file ENOENT)
 *   - error  : the pool is unavailable (network / 5xx / 429 / timeout) → "unknown", defer
 *
 * Each pool URL is file-or-http via the existing dual-mode (a `fetch()` of a filesystem path throws
 * ERR_INVALID_URL → fall back to a local read), resolved against the PER-POOL base.
 */
import { readJsonStable, readFileStable, delay } from '../utils/readFileStable';
import { validateAndResolveUserPath } from '../utils/validateLocalPath';
import type { UserData } from './updateUsers';

// The fetch layer owns its own retry config (mirrors updateUsers' MAX_RETRIES values).
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 500;

/**
 * Build the per-request options applied to every pool HTTP call, from optional env config. This is
 * what lets a deployment send a whitelisted identity (so the pool's rate limiter lets multi-pool's
 * N× request volume through) and bound slow requests:
 *   POOL_API_USER_AGENT             — User-Agent header (e.g. "ckstats/1.0")
 *   POOL_API_TOKEN                  — sent as "Authorization: Bearer <token>"
 *   POOL_API_EXTRA_HEADERS          — JSON object of additional headers (merged last, can override)
 *   POOL_API_REQUEST_TIMEOUT_SECONDS — abort a request that takes longer than this many seconds
 * All are optional; with none set this returns {} and fetch behaves exactly as before. A fresh
 * object (and a fresh AbortSignal) is built per call, since a timeout signal fires only once.
 */
export function poolFetchInit(): RequestInit {
  const headers: Record<string, string> = {};

  const ua = process.env.POOL_API_USER_AGENT?.trim();
  if (ua) headers['User-Agent'] = ua;

  const token = process.env.POOL_API_TOKEN?.trim();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const extra = process.env.POOL_API_EXTRA_HEADERS?.trim();
  if (extra) {
    try {
      const parsed = JSON.parse(extra);
      if (parsed && typeof parsed === 'object') {
        for (const [k, v] of Object.entries(parsed)) headers[k] = String(v);
      }
    } catch {
      console.warn('POOL_API_EXTRA_HEADERS is not valid JSON; ignoring it');
    }
  }

  const init: RequestInit = {};
  if (Object.keys(headers).length > 0) init.headers = headers;

  const seconds = Number(process.env.POOL_API_REQUEST_TIMEOUT_SECONDS);
  if (Number.isFinite(seconds) && seconds > 0) {
    init.signal = AbortSignal.timeout(seconds * 1000);
  }

  return init;
}

export type PoolFetchResult<T> =
  | { status: 'found'; base: string; data: T }
  | { status: 'absent'; base: string }
  | { status: 'error'; base: string; error: unknown };

function isInvalidUrl(error: any): boolean {
  return error?.cause?.code === 'ERR_INVALID_URL';
}

/** Fetch one pool's data for a user. base is the pool URL (http base or local file root). */
export async function fetchUserFromPool(
  base: string,
  address: string
): Promise<PoolFetchResult<UserData>> {
  const url = `${base}/users/${address}`;
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(url, poolFetchInit());
      if (response.status === 404) return { status: 'absent', base };
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      return { status: 'found', base, data: (await response.json()) as UserData };
    } catch (error: any) {
      lastError = error;

      // Filesystem path → read locally, resolved against THIS pool's base.
      if (isInvalidUrl(error)) {
        try {
          const resolved = validateAndResolveUserPath(address, base);
          const data = (await readJsonStable(resolved, { retries: 6, backoffMs: 50 })) as UserData;
          return { status: 'found', base, data };
        } catch (fileError: any) {
          if (fileError?.code === 'ENOENT') return { status: 'absent', base };
          return { status: 'error', base, error: fileError };
        }
      }

      if (attempt === MAX_RETRIES) return { status: 'error', base, error: lastError };
      await delay(RETRY_DELAY_MS * attempt);
    }
  }
  return { status: 'error', base, error: lastError };
}

/** Fetch one pool's raw pool.status text (parsed by the caller, as seed does today). */
export async function fetchPoolStatusFromPool(base: string): Promise<PoolFetchResult<string>> {
  const url = `${base}/pool/pool.status`;
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(url, poolFetchInit());
      if (response.status === 404) return { status: 'absent', base };
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      return { status: 'found', base, data: await response.text() };
    } catch (error: any) {
      lastError = error;
      if (isInvalidUrl(error)) {
        try {
          const data = await readFileStable(url, { retries: 6, backoffMs: 50 });
          return { status: 'found', base, data };
        } catch (fileError: any) {
          if (fileError?.code === 'ENOENT') return { status: 'absent', base };
          return { status: 'error', base, error: fileError };
        }
      }
      if (attempt === MAX_RETRIES) return { status: 'error', base, error: lastError };
      await delay(RETRY_DELAY_MS * attempt);
    }
  }
  return { status: 'error', base, error: lastError };
}

/** Run a per-pool fetch across all pool URLs in parallel; never rejects (allSettled). */
export async function fetchAllPools<T>(
  bases: string[],
  fetchOne: (base: string) => Promise<PoolFetchResult<T>>
): Promise<PoolFetchResult<T>[]> {
  const settled = await Promise.allSettled(bases.map((b) => fetchOne(b)));
  return settled.map((s, i) =>
    s.status === 'fulfilled'
      ? s.value
      : { status: 'error' as const, base: bases[i], error: s.reason }
  );
}
