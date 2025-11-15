export const RATE_LIMIT = 60; // max requests
export const WINDOW_MS = 60_000; // per minute
export const MAX_BODY_BYTES = 64 * 1024; // 64KB - reject larger payloads early
const RATE_MAP_CLEANUP_THRESHOLD = 10_000; // when to run a quick cleanup pass
type Rec = { count: number; start: number };

const rateMap = new Map<string, Rec>();

// Test helper: clear in-memory rate map between tests
export function __clearRateMapForTests() {
  rateMap.clear();
}

export async function POST(req: Request) {
  try {
    const envToken = process.env.CLIENT_LOG_TOKEN;
    if (envToken) {
      const headerToken = req.headers.get('x-client-log-token');
      if (!headerToken || headerToken !== envToken) {
        return new Response('unauthorized', { status: 401 });
      }
    }

    const ip =
      req.headers.get('x-forwarded-for') ||
      req.headers.get('x-real-ip') ||
      'anon';
    const key = String(ip);

    const now = Date.now();

    // keep the in-memory rateMap bounded in long-running processes — clean stale entries first
    if (rateMap.size > RATE_MAP_CLEANUP_THRESHOLD) {
      const cutoff = now - WINDOW_MS * 2;
      for (const [k, r] of rateMap) {
        if (r.start < cutoff) rateMap.delete(k);
      }
    }

    let rec = rateMap.get(key);
    if (!rec || now - rec.start > WINDOW_MS) {
      rec = { count: 0, start: now };
    }
    rec.count += 1;
    rateMap.set(key, rec);
    if (rec.count > RATE_LIMIT) {
      return new Response('rate-limited', { status: 429 });
    }

    // If the client advertises a Content-Length header, honor it before reading body
    const contentLength = req.headers.get('content-length');
    if (contentLength) {
      const n = parseInt(contentLength, 10);
      if (!Number.isNaN(n) && n > MAX_BODY_BYTES) {
        return new Response('payload too large', { status: 413 });
      }
    }

    const body = await req.text().catch(() => '');

    // cheap defensive limit to avoid huge request bodies from consuming memory/CPU
    if (body && body.length > MAX_BODY_BYTES) {
      return new Response('payload too large', { status: 413 });
    }
    const parsed = (() => {
      try {
        return body ? JSON.parse(body) : null;
      } catch {
        return { raw: body };
      }
    })();

    const out = {
      receivedAt: new Date().toISOString(),
      ip,
      payload: parsed,
    };

    // write to stderr so systemd/journal picks it up
    console.error('[client-log]', JSON.stringify(out));

    return new Response(null, { status: 204 });
  } catch (err) {
    console.error('[client-log][error]', String(err));
    return new Response(null, { status: 500 });
  }
}
