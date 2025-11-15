import { POST, __clearRateMapForTests, RATE_LIMIT, MAX_BODY_BYTES } from '../app/api/client-logs/route';

// Build a minimal Request-like object compatible with the handler under test.
function makeReq(body: string | null, headers: Record<string, string> = {}) {
  const hdrs = Object.assign({ 'Content-Type': 'application/json' }, headers || {});
  return {
    text: async () => (body === null ? '' : body),
    headers: {
      get: (k: string) => {
        const key = Object.keys(hdrs).find((h) => h.toLowerCase() === k.toLowerCase());
        return key ? String(hdrs[key]) : null;
      },
    },
  } as unknown as Request;
}

beforeEach(() => {
  __clearRateMapForTests();
});

describe('POST /api/client-logs handler (unit)', () => {
  test('small JSON returns 204', async () => {
    const req = makeReq(JSON.stringify({ message: 'ok' }), { 'x-forwarded-for': '127.0.0.1-1' });
    const res: any = await POST(req as any);
    expect(res.status).toBe(204);
  });

  test('oversized payload returns 413', async () => {
    const big = 'A'.repeat(MAX_BODY_BYTES + 1024);
    const req = makeReq(big, { 'x-forwarded-for': '127.0.0.1-2' });
    const res: any = await POST(req as any);
    expect(res.status).toBe(413);
  });

  test('Content-Length header > MAX_BODY_BYTES returns 413 without reading body', async () => {
    const bigLen = MAX_BODY_BYTES + 1000;
    const req = makeReq(null, { 'x-forwarded-for': '127.0.0.1-CL', 'content-length': String(bigLen) });
    const res: any = await POST(req as any);
    expect(res.status).toBe(413);
  });

  test('non-JSON payload accepted (204)', async () => {
    const req = makeReq('plain-text', { 'Content-Type': 'text/plain', 'x-forwarded-for': '127.0.0.1-3' });
    const res: any = await POST(req as any);
    expect(res.status).toBe(204);
  });

  test('token required when CLIENT_LOG_TOKEN set', async () => {
    process.env.CLIENT_LOG_TOKEN = 't'
    try {
      const reqNoHeader = makeReq(JSON.stringify({}), { 'x-forwarded-for': '127.0.0.1-4' });
      const res1: any = await POST(reqNoHeader as any);
      expect(res1.status).toBe(401);

      const reqWithHeader = makeReq(JSON.stringify({}), { 'x-forwarded-for': '127.0.0.1-4', 'x-client-log-token': 't' });
      const res2: any = await POST(reqWithHeader as any);
      expect(res2.status).toBe(204);
    } finally {
      delete process.env.CLIENT_LOG_TOKEN;
    }
  });

  test('rate limit triggers 429 after limit', async () => {
    const ip = '127.0.0.1-limit';
    for (let i = 0; i < RATE_LIMIT + 1; i++) {
      const r: any = await POST(makeReq(JSON.stringify({ n: i }), { 'x-forwarded-for': ip }) as any);
      if (i < RATE_LIMIT) expect(r.status).toBe(204);
      else expect(r.status).toBe(429);
    }
  });
});
