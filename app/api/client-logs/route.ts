const RATE_LIMIT = 60; // max requests
const WINDOW_MS = 60_000; // per minute
type Rec = { count: number; start: number };

const rateMap = new Map<string, Rec>();

export async function POST(req: Request) {
  try {
    const envToken = process.env.CLIENT_LOG_TOKEN;
    if (envToken) {
      const headerToken = req.headers.get('x-client-log-token');
      if (!headerToken || headerToken !== envToken) {
        return new Response('unauthorized', { status: 401 });
      }
    }

    const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'anon';
    const key = String(ip);

    const now = Date.now();
    let rec = rateMap.get(key);
    if (!rec || now - rec.start > WINDOW_MS) {
      rec = { count: 0, start: now };
    }
    rec.count += 1;
    rateMap.set(key, rec);
    if (rec.count > RATE_LIMIT) {
      return new Response('rate-limited', { status: 429 });
    }

    const body = await req.text().catch(() => '');
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
