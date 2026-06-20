/**
 * @jest-environment node
 */

/**
 * Tests for the multi-pool fetch layer (scripts/fetchPools.ts). Unlike the old
 * fetchUserDataWithRetry (which threw), fetchUserFromPool/fetchPoolStatusFromPool CLASSIFY each
 * outcome as found / absent / error so the combine + inactivity logic can reason about it:
 *   - found  : data in hand (HTTP 200 or a successful local read)
 *   - absent : genuinely not here (HTTP 404 or file ENOENT) — NOT retried, NOT an error
 *   - error  : transient/unknown (network, 5xx, non-ENOENT file error, timeout) — retried first
 * These tests assert that mapping plus the linear-backoff retry, mirroring the coverage the
 * retired updateUsers.retry.test.ts had for the single-pool fetch.
 */
import {
  fetchUserFromPool,
  fetchPoolStatusFromPool,
  fetchAllPools,
  poolFetchInit,
} from '../../scripts/fetchPools';
import * as readFileStableModule from '../../utils/readFileStable';

jest.mock('../../utils/readFileStable', () => ({
  ...jest.requireActual('../../utils/readFileStable'),
  delay: jest.fn().mockResolvedValue(undefined),
  readJsonStable: jest.fn(),
  readFileStable: jest.fn(),
}));

jest.mock('../../utils/validateLocalPath', () => ({
  validateAndResolveUserPath: jest.fn(),
}));

// fetchPools owns these privately; the tests hardcode the same values it uses.
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 500;

const { validateAndResolveUserPath } = require('../../utils/validateLocalPath');
const { readJsonStable, readFileStable, delay } = readFileStableModule;

const mkUser = (over: Record<string, unknown> = {}) => ({
  authorised: 123,
  workers: 1,
  hashrate1m: 100,
  hashrate5m: 100,
  hashrate1hr: 100,
  hashrate1d: 100,
  hashrate7d: 100,
  lastshare: 1000,
  shares: '1000',
  bestshare: '1',
  bestever: '1',
  worker: [],
  ...over,
});

const invalidUrlError = () => {
  const e = new Error('Invalid URL') as any;
  e.cause = { code: 'ERR_INVALID_URL' };
  return e;
};

describe('fetchUserFromPool', () => {
  let originalFetch: typeof global.fetch;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    originalFetch = global.fetch;
    fetchMock = jest.fn();
    global.fetch = fetchMock as any;
    jest.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('HTTP', () => {
    it('returns found on first success', async () => {
      const data = mkUser();
      fetchMock.mockResolvedValueOnce({ ok: true, json: async () => data });

      const r = await fetchUserFromPool('https://a.com', 'addr');

      expect(r).toEqual({ status: 'found', base: 'https://a.com', data });
      expect(fetchMock.mock.calls[0][0]).toBe('https://a.com/users/addr');
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(delay).not.toHaveBeenCalled();
    });

    it('returns absent on HTTP 404 WITHOUT retrying', async () => {
      fetchMock.mockResolvedValue({ ok: false, status: 404 });

      const r = await fetchUserFromPool('https://a.com', 'addr');

      expect(r).toEqual({ status: 'absent', base: 'https://a.com' });
      expect(fetchMock).toHaveBeenCalledTimes(1); // 404 is terminal, not a transient error
      expect(delay).not.toHaveBeenCalled();
    });

    it('retries a 5xx MAX_RETRIES times then returns error', async () => {
      fetchMock.mockResolvedValue({ ok: false, status: 503 });

      const r = await fetchUserFromPool('https://a.com', 'addr');

      expect(r.status).toBe('error');
      expect(fetchMock).toHaveBeenCalledTimes(MAX_RETRIES);
      expect(delay).toHaveBeenCalledTimes(MAX_RETRIES - 1);
    });

    it('retries a network rejection then returns error, with linear backoff', async () => {
      fetchMock.mockRejectedValue(new Error('Network error'));

      const r = await fetchUserFromPool('https://a.com', 'addr');

      expect(r.status).toBe('error');
      expect((r as any).error.message).toBe('Network error');
      expect(fetchMock).toHaveBeenCalledTimes(MAX_RETRIES);
      expect(delay).toHaveBeenNthCalledWith(1, RETRY_DELAY_MS * 1);
      expect(delay).toHaveBeenNthCalledWith(2, RETRY_DELAY_MS * 2);
    });

    it('treats a 200 whose body is not user-shaped (no worker array) as error, not found', async () => {
      // e.g. a misconfigured pool serving a 200 HTML page or an error blob that happens to parse
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ error: 'not found' }),
      });

      const r = await fetchUserFromPool('https://a.com', 'addr');

      expect(r.status).toBe('error'); // never 'found' with garbage; never written to the DB
      expect(fetchMock).toHaveBeenCalledTimes(MAX_RETRIES);
    });

    it('recovers to found on a later attempt', async () => {
      const data = mkUser({ authorised: 456 });
      fetchMock
        .mockRejectedValueOnce(new Error('boom'))
        .mockResolvedValueOnce({ ok: true, json: async () => data });

      const r = await fetchUserFromPool('https://a.com', 'addr');

      expect(r).toEqual({ status: 'found', base: 'https://a.com', data });
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(delay).toHaveBeenCalledTimes(1);
    });
  });

  describe('local-file fallback (fetch throws ERR_INVALID_URL)', () => {
    it('reads the file and returns found, resolving against THIS pool base', async () => {
      const data = mkUser({ authorised: 999 });
      fetchMock.mockRejectedValueOnce(invalidUrlError());
      validateAndResolveUserPath.mockReturnValueOnce('/safe/users/addr');
      (readJsonStable as jest.Mock).mockResolvedValueOnce(data);

      const r = await fetchUserFromPool('/var/log/ckpool', 'addr');

      expect(r).toEqual({ status: 'found', base: '/var/log/ckpool', data });
      expect(validateAndResolveUserPath).toHaveBeenCalledWith(
        'addr',
        '/var/log/ckpool'
      );
      expect(readJsonStable).toHaveBeenCalledWith('/safe/users/addr', {
        retries: 6,
        backoffMs: 50,
      });
    });

    it('maps a missing file (ENOENT) to absent (not error)', async () => {
      fetchMock.mockRejectedValue(invalidUrlError());
      validateAndResolveUserPath.mockReturnValue('/safe/users/addr');
      const enoent = Object.assign(new Error('nope'), { code: 'ENOENT' });
      (readJsonStable as jest.Mock).mockRejectedValue(enoent);

      const r = await fetchUserFromPool('/var/log/ckpool', 'addr');

      expect(r).toEqual({ status: 'absent', base: '/var/log/ckpool' });
    });

    it('maps a non-ENOENT file error (e.g. EACCES) to error', async () => {
      fetchMock.mockRejectedValue(invalidUrlError());
      validateAndResolveUserPath.mockReturnValue('/safe/users/addr');
      const eacces = Object.assign(new Error('denied'), { code: 'EACCES' });
      (readJsonStable as jest.Mock).mockRejectedValue(eacces);

      const r = await fetchUserFromPool('/var/log/ckpool', 'addr');

      expect(r.status).toBe('error');
      expect((r as any).error.code).toBe('EACCES');
    });
  });
});

describe('fetchPoolStatusFromPool', () => {
  let originalFetch: typeof global.fetch;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    originalFetch = global.fetch;
    fetchMock = jest.fn();
    global.fetch = fetchMock as any;
    jest.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('returns found with the raw text body', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      text: async () => '{"Users":5}',
    });

    const r = await fetchPoolStatusFromPool('https://a.com');

    expect(r).toEqual({
      status: 'found',
      base: 'https://a.com',
      data: '{"Users":5}',
    });
    expect(fetchMock.mock.calls[0][0]).toBe('https://a.com/pool/pool.status');
  });

  it('falls back to a local read on ERR_INVALID_URL', async () => {
    fetchMock.mockRejectedValueOnce(invalidUrlError());
    (readFileStable as jest.Mock).mockResolvedValueOnce('{"Users":7}');

    const r = await fetchPoolStatusFromPool('/var/log/ckpool');

    expect(r).toEqual({
      status: 'found',
      base: '/var/log/ckpool',
      data: '{"Users":7}',
    });
    expect(readFileStable).toHaveBeenCalledWith(
      '/var/log/ckpool/pool/pool.status',
      {
        retries: 6,
        backoffMs: 50,
      }
    );
  });

  it('returns absent on 404', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 404 });
    const r = await fetchPoolStatusFromPool('https://a.com');
    expect(r).toEqual({ status: 'absent', base: 'https://a.com' });
  });

  it('treats a 200 HTML/redirect page (not JSON) as error, not found', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      text: async () => '<html>301 Moved</html>',
    });
    const r = await fetchPoolStatusFromPool('https://a.com');
    expect(r.status).toBe('error');
  });
});

describe('poolFetchInit (env-driven request options)', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it('returns {} when no API_* env is set (opt-in only, no default timeout)', () => {
    delete process.env.API_USER_AGENT;
    delete process.env.API_TOKEN;
    delete process.env.API_EXTRA_HEADERS;
    delete process.env.API_REQUEST_TIMEOUT_SECONDS;
    expect(poolFetchInit()).toEqual({});
  });

  it('sets the User-Agent header', () => {
    process.env.API_USER_AGENT = 'ckstats/1.0';
    expect(
      (poolFetchInit().headers as Record<string, string>)['User-Agent']
    ).toBe('ckstats/1.0');
  });

  it('sends the token as a Bearer Authorization header', () => {
    process.env.API_TOKEN = 'secret123';
    expect(
      (poolFetchInit().headers as Record<string, string>)['Authorization']
    ).toBe('Bearer secret123');
  });

  it('merges arbitrary JSON extra headers', () => {
    process.env.API_USER_AGENT = 'ckstats/1.0';
    process.env.API_EXTRA_HEADERS = '{"X-Pool-Key":"abc","X-Trace":"1"}';
    const h = poolFetchInit().headers as Record<string, string>;
    expect(h['User-Agent']).toBe('ckstats/1.0');
    expect(h['X-Pool-Key']).toBe('abc');
    expect(h['X-Trace']).toBe('1');
  });

  it('ignores malformed API_EXTRA_HEADERS without throwing', () => {
    process.env.API_USER_AGENT = 'ckstats/1.0';
    process.env.API_EXTRA_HEADERS = 'not json';
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const h = poolFetchInit().headers as Record<string, string>;
    expect(h['User-Agent']).toBe('ckstats/1.0');
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('attaches an AbortSignal when a positive timeout is set', () => {
    process.env.API_REQUEST_TIMEOUT_SECONDS = '5';
    expect(poolFetchInit().signal).toBeInstanceOf(AbortSignal);
  });

  it('omits the signal for a zero / non-numeric timeout', () => {
    process.env.API_REQUEST_TIMEOUT_SECONDS = '0';
    expect(poolFetchInit().signal).toBeUndefined();
    process.env.API_REQUEST_TIMEOUT_SECONDS = 'abc';
    expect(poolFetchInit().signal).toBeUndefined();
  });
});

describe('fetchAllPools', () => {
  it('runs the fetch across every base and preserves order', async () => {
    const fetchOne = jest.fn(async (base: string) => ({
      status: 'found' as const,
      base,
      data: base.toUpperCase(),
    }));

    const out = await fetchAllPools(['a', 'b', 'c'], fetchOne);

    expect(out.map((r) => r.base)).toEqual(['a', 'b', 'c']);
    expect(fetchOne).toHaveBeenCalledTimes(3);
  });

  it('never rejects: a thrown fetchOne becomes an error result for that base', async () => {
    const fetchOne = jest.fn(async (base: string) => {
      if (base === 'b') throw new Error('exploded');
      return { status: 'found' as const, base, data: 1 };
    });

    const out = await fetchAllPools(['a', 'b'], fetchOne);

    expect(out[0]).toMatchObject({ status: 'found', base: 'a' });
    expect(out[1].status).toBe('error');
    expect(out[1].base).toBe('b');
  });
});
