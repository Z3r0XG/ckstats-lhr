/**
 * Multi-pool fetch layer: fetch one upstream pool (http OR local file) and CLASSIFY the outcome so
 * the combine + inactivity logic can reason about it.
 *
 * Classification (the same buckets drive stats, inactivity, and high-score):
 *   - found  : we have this pool's data
 *   - absent : the user/pool genuinely isn't on this pool (HTTP 404 or file ENOENT)
 *   - error  : the pool is unavailable (network / 5xx / 429 / timeout) → "unknown", defer
 *
 * Each pool URL is file-or-http via the existing dual-mode (a `fetch()` of a filesystem path throws
 * ERR_INVALID_URL → fall back to a local read), resolved against the PER-POOL base.
 */
import { fetch as undiciFetch } from 'undici';

import { readJsonStable, readFileStable, delay } from '../utils/readFileStable';
import { validateAndResolveUserPath } from '../utils/validateLocalPath';
import type { UserData } from './updateUsers';

// The fetch layer owns its own retry config (mirrors updateUsers' MAX_RETRIES values).
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 500;
const RETRY_MAX_DELAY_MS = 5000;

// Exponential backoff with full jitter — sleep a random duration in [0, capped exponential]. A cycle
// fans out many requests at once, so a fixed/linear delay would make all the failures retry in
// lockstep and hammer a struggling endpoint in synchronized waves; the random spread breaks that up.
function retryBackoffMs(attempt: number): number {
  const exp = Math.min(RETRY_MAX_DELAY_MS, RETRY_DELAY_MS * 2 ** (attempt - 1));
  return Math.random() * exp;
}

/**
 * Build the per-request options applied to every pool HTTP call, from optional env config. This is
 * what lets a deployment send a whitelisted identity (so the pool's rate limiter lets multi-pool's
 * N× request volume through) and bound slow requests:
 *   API_USER_AGENT             — User-Agent header (e.g. "ckstats/1.0")
 *   API_TOKEN                  — sent as "Authorization: Bearer <token>"
 *   API_EXTRA_HEADERS          — JSON object of additional headers (merged last, can override)
 *   API_REQUEST_TIMEOUT_SECONDS — abort a request that takes longer than this many seconds
 * All are optional; with none set this returns {} and fetch behaves exactly as before. A fresh
 * object (and a fresh AbortSignal) is built per call, since a timeout signal fires only once.
 */
export function poolFetchInit(dispatcher?: unknown): RequestInit {
  const headers: Record<string, string> = {};

  const ua = process.env.API_USER_AGENT?.trim();
  if (ua) headers['User-Agent'] = ua;

  const token = process.env.API_TOKEN?.trim();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const extra = process.env.API_EXTRA_HEADERS?.trim();
  if (extra) {
    try {
      const parsed = JSON.parse(extra);
      if (parsed && typeof parsed === 'object') {
        for (const [k, v] of Object.entries(parsed)) headers[k] = String(v);
      }
    } catch {
      console.warn('API_EXTRA_HEADERS is not valid JSON; ignoring it');
    }
  }

  const init: RequestInit = {};
  if (Object.keys(headers).length > 0) init.headers = headers;

  // Bound a hung request when configured (opt-in; omit/0 = no app-level timeout). With a keep-alive
  // Agent (dispatcher) the Agent's headersTimeout/bodyTimeout already bound each request from DISPATCH
  // time — correct whether requests multiplex (HTTP/2) or queue behind a small connection pool
  // (HTTP/1.1). A request-level AbortSignal.timeout instead starts at creation, so on HTTP/1.1 a
  // queued request can abort before it is ever sent. So only use the signal on the no-dispatcher
  // (global fetch) path, where it is the only available bound.
  const seconds = Number(process.env.API_REQUEST_TIMEOUT_SECONDS);
  if (Number.isFinite(seconds) && seconds > 0 && !dispatcher) {
    init.signal = AbortSignal.timeout(seconds * 1000);
  }

  // Optional undici Dispatcher (Agent/Pool) — lets the in-process ingest loop reuse persistent
  // keep-alive connections across cycles (handshake paid once). Not in the DOM RequestInit type,
  // but Node's fetch honors it. Omitted everywhere else → unchanged behavior.
  if (dispatcher) (init as { dispatcher?: unknown }).dispatcher = dispatcher;

  return init;
}

export type PoolFetchResult<T> =
  | { status: 'found'; base: string; data: T }
  | { status: 'absent'; base: string }
  | { status: 'error'; base: string; error: unknown };

function isInvalidUrl(error: any): boolean {
  return error?.cause?.code === 'ERR_INVALID_URL';
}

/**
 * Clean-data guard: only treat a payload as real if it actually has the shape of CKPool user
 * stats. A 2xx that parses as JSON is NOT enough — a misconfigured pool can serve an HTML page, a
 * proxy/error blob, or a redirect target with a 200, and combining that into the DB would corrupt
 * the data. The presence of a `worker` array is CKPool's reliable signature of a user payload.
 * Anything that fails this is handled exactly like any other error (deferred), not stored.
 */
function isUserDataShape(d: unknown): d is UserData {
  return (
    !!d &&
    typeof d === 'object' &&
    Array.isArray((d as { worker?: unknown }).worker)
  );
}

/** Clean-data guard for pool.status text: CKPool emits newline-delimited JSON objects, so a valid
 *  body starts with `{`. Rejects HTML/redirect pages (and empty reads) before they reach the parser. */
function looksLikeJson(text: string): boolean {
  return text.trimStart().startsWith('{');
}

// Node's GLOBAL fetch uses its built-in undici and rejects a dispatcher from the npm `undici`
// package ("invalid onRequestStart method"). So when a dispatcher (persistent Agent) is supplied,
// use undici's own fetch (same instance); otherwise the global fetch — which is what the tests mock.
function chooseFetch(dispatcher?: unknown): typeof fetch {
  return dispatcher ? (undiciFetch as unknown as typeof fetch) : fetch;
}

/** Fetch one pool's data for a user. base is the pool URL (http base or local file root). */
export async function fetchUserFromPool(
  base: string,
  address: string,
  dispatcher?: unknown
): Promise<PoolFetchResult<UserData>> {
  const url = `${base}/users/${address}`;
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await chooseFetch(dispatcher)(
        url,
        poolFetchInit(dispatcher)
      );
      if (response.status === 404) return { status: 'absent', base };
      if (!response.ok)
        throw new Error(`HTTP error! status: ${response.status}`);
      const data = await response.json();
      if (!isUserDataShape(data)) {
        throw new Error(`malformed user payload from ${url} (no worker array)`);
      }
      return { status: 'found', base, data };
    } catch (error: any) {
      lastError = error;

      // Filesystem path → read locally, resolved against THIS pool's base.
      if (isInvalidUrl(error)) {
        try {
          const resolved = validateAndResolveUserPath(address, base);
          const data = await readJsonStable(resolved, {
            retries: 6,
            backoffMs: 50,
          });
          if (!isUserDataShape(data)) {
            return {
              status: 'error',
              base,
              error: new Error(`malformed user file for ${address}`),
            };
          }
          return { status: 'found', base, data };
        } catch (fileError: any) {
          if (fileError?.code === 'ENOENT') return { status: 'absent', base };
          return { status: 'error', base, error: fileError };
        }
      }

      if (attempt === MAX_RETRIES)
        return { status: 'error', base, error: lastError };
      await delay(retryBackoffMs(attempt));
    }
  }
  return { status: 'error', base, error: lastError };
}

/** Fetch one pool's raw pool.status text (parsed by the caller, as seed does today). */
export async function fetchPoolStatusFromPool(
  base: string,
  dispatcher?: unknown
): Promise<PoolFetchResult<string>> {
  const url = `${base}/pool/pool.status`;
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await chooseFetch(dispatcher)(
        url,
        poolFetchInit(dispatcher)
      );
      if (response.status === 404) return { status: 'absent', base };
      if (!response.ok)
        throw new Error(`HTTP error! status: ${response.status}`);
      const text = await response.text();
      if (!looksLikeJson(text)) {
        throw new Error(`malformed pool.status from ${url} (not JSON)`);
      }
      return { status: 'found', base, data: text };
    } catch (error: any) {
      lastError = error;
      if (isInvalidUrl(error)) {
        try {
          const data = await readFileStable(url, { retries: 6, backoffMs: 50 });
          if (!looksLikeJson(data)) {
            return {
              status: 'error',
              base,
              error: new Error(`malformed pool.status file at ${url}`),
            };
          }
          return { status: 'found', base, data };
        } catch (fileError: any) {
          if (fileError?.code === 'ENOENT') return { status: 'absent', base };
          return { status: 'error', base, error: fileError };
        }
      }
      if (attempt === MAX_RETRIES)
        return { status: 'error', base, error: lastError };
      await delay(retryBackoffMs(attempt));
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
