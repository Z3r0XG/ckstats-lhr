import { NextResponse } from 'next/server';

import { getPoolSources } from '../../../../../scripts/combine';
import { fetchUserFromPool } from '../../../../../scripts/fetchPools';

export const dynamic = 'force-dynamic';

/**
 * Diagnostic: live-probe each configured pool for one address and report the per-pool outcome
 * (found / absent / error) — so "why isn't this user ingesting?" is answerable without grepping logs.
 * Off by default (like the other /api/debug/* routes); enable with DEBUG_ENDPOINTS=true. It does real
 * outbound fetches per call, so keep it disabled in normal operation.
 */
export async function GET(
  _req: Request,
  { params }: { params: { address: string } }
) {
  if (process.env.DEBUG_ENDPOINTS !== 'true') {
    return new NextResponse('Not Found', { status: 404 });
  }

  const address = decodeURIComponent(params.address ?? '').trim();
  // Addresses are bech32/base58 — no whitespace or path separators (also blocks file-path traversal).
  if (!address || address.length > 256 || /[\s/\\]/.test(address)) {
    return NextResponse.json({ error: 'invalid address' }, { status: 400 });
  }

  const sources = getPoolSources();
  const pools = await Promise.all(
    sources.map(async (src) => {
      const t = Date.now();
      const r = await fetchUserFromPool(src.url, address);
      const base = {
        label: src.label,
        url: src.url,
        status: r.status,
        ms: Date.now() - t,
      };
      if (r.status === 'found') {
        const worker = (r.data as { worker?: unknown[] })?.worker;
        return {
          ...base,
          workers: Array.isArray(worker) ? worker.length : null,
        };
      }
      if (r.status === 'error') {
        const err = r.error as { message?: string } | undefined;
        return { ...base, error: err?.message ?? String(r.error) };
      }
      return base;
    })
  );

  return NextResponse.json({
    address,
    summary: {
      found: pools.filter((p) => p.status === 'found').length,
      absent: pools.filter((p) => p.status === 'absent').length,
      error: pools.filter((p) => p.status === 'error').length,
    },
    pools,
  });
}
