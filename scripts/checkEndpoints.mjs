#!/usr/bin/env node
/*
 * Pool endpoint health check. For each deployment's .env, reads API_URL (+ API_USER_AGENT) and probes
 * every configured pool's `/pool/pool.status` and `/users/<addr>`. Flags the recurring nginx /users
 * mapping bug (a 301 where a correctly-mapped endpoint returns 200/404) and unreachable endpoints.
 * Generic: it only reads each deployment's own config — nothing about hosts/regions is hardcoded.
 *
 * Usage:
 *   node scripts/checkEndpoints.mjs <.env-or-dir> [more...]
 *   node scripts/checkEndpoints.mjs /stats/ckstats-lhr_btc /stats/ckstats-lhr_bch   # dirs
 *   node scripts/checkEndpoints.mjs .env --addr <wallet>         # real wallet → found/absent check
 *
 * /users with no --addr uses a non-existent probe address: a correct mapping returns 404, a broken
 * one returns 301. With --addr it reports found (200, with worker count) / absent (404) / error.
 * Exits 1 if any issue is found, 0 if all healthy.
 */
import { readFileSync, statSync } from 'fs';
import { join } from 'path';

const PROBE = 'CHECKPROBEADDRESS';
const TIMEOUT_MS = 8000;

const argv = process.argv.slice(2);
const addrIdx = argv.indexOf('--addr');
const addr = addrIdx !== -1 ? argv[addrIdx + 1] : null;
const paths = argv.filter(
  (_a, i) => addrIdx === -1 || (i !== addrIdx && i !== addrIdx + 1)
);
if (paths.length === 0) {
  console.error(
    'usage: node scripts/checkEndpoints.mjs <.env-or-dir> [...] [--addr <wallet>]'
  );
  process.exit(2);
}

function parseEnv(file) {
  const out = {};
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Za-z0-9_-]+)\s*=\s*(.*?)\s*$/);
    if (!m || line.trim().startsWith('#')) continue;
    let v = m[2];
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    out[m[1]] = v;
  }
  return out;
}

const resolveEnv = (p) => {
  try {
    return statSync(p).isDirectory() ? join(p, '.env') : p;
  } catch {
    return p;
  }
};

async function hit(url, ua) {
  try {
    const res = await fetch(url, {
      headers: ua ? { 'User-Agent': ua } : {},
      redirect: 'manual', // surface a 301 rather than follow it — the 301 is the signal
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return { code: String(res.status), res };
  } catch (e) {
    return { code: 'ERR', error: e?.message ?? String(e) };
  }
}

let problems = 0;

for (const arg of paths) {
  const file = resolveEnv(arg);
  let env;
  try {
    env = parseEnv(file);
  } catch (e) {
    console.log(`\n${arg}: cannot read ${file} (${e.message})`);
    problems++;
    continue;
  }
  const coin = env.COIN || file;
  const ua = env.API_USER_AGENT;
  let sources;
  try {
    const v = (env.API_URL || '').trim();
    sources = v.startsWith('[')
      ? JSON.parse(v)
      : v
        ? [{ url: v, label: '-' }]
        : [];
  } catch {
    console.log(`\n${coin}: API_URL is not valid JSON`);
    problems++;
    continue;
  }
  if (sources.length === 0) {
    console.log(`\n${coin}: no API_URL configured`);
    continue;
  }

  console.log(`\n=== ${coin} (${file}) ===`);
  for (const s of sources) {
    const base = String(s.url).replace(/\/+$/, '');
    const ps = await hit(`${base}/pool/pool.status`, ua);
    const u = await hit(`${base}/users/${addr || PROBE}`, ua);

    let extra = '';
    let note = '';
    if (u.code === '200' && addr) {
      try {
        const j = await u.res.json();
        extra = ` (found, workers=${Array.isArray(j.worker) ? j.worker.length : '?'})`;
      } catch {
        extra = ' (200 but non-JSON)';
        note = ' <-- /users returns non-JSON';
        problems++;
      }
    }
    if (u.code === '301') {
      note = ' <-- /users MAPPING BUG (301)';
      problems++;
    } else if (ps.code === 'ERR' || u.code === 'ERR') {
      note = ` <-- UNREACHABLE${ps.error ? ` (${ps.error})` : ''}`;
      problems++;
    } else if (Number(ps.code) >= 500 || Number(u.code) >= 500) {
      note = ' <-- 5xx';
      problems++;
    }

    console.log(
      `  ${String(s.label ?? '-').padEnd(6)} pool.status=${ps.code.padEnd(4)} /users=${u.code.padEnd(4)}${extra}${note}`
    );
  }
}

console.log(
  problems ? `\n${problems} issue(s) found.` : '\nAll endpoints healthy.'
);
process.exit(problems ? 1 : 0);
