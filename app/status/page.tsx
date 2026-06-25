import StatusTable from '../../components/StatusTable';
import { getServiceSnapshot } from '../../lib/poolHealth';

// In-memory pool health is request-time state — never cache this page.
export const dynamic = 'force-dynamic';

const STALE_MS = (Number(process.env.POOL_HEALTH_STALE_SECONDS) || 300) * 1000;

export default function StatusPage() {
  // One row per pool — the only per-pool view. Status + Last Update are the stats-meta columns; the
  // rest are ckpool metrics. Net diff / avg-time / high scores are deliberately absent (net diff is
  // identical across same-coin pools; high scores are a COMBINED, globally-sorted ledger, not per
  // pool). The sortable table is a client component; pools arrive in non-deterministic Map order, so
  // it sorts by Pool name by default.
  const { pools } = getServiceSnapshot();
  const showRejected = process.env.NEXT_PUBLIC_SHOW_REJECTED_STATS === 'true';
  const showShareCounts = process.env.NEXT_PUBLIC_SHOW_SHARE_COUNTS === 'true';

  return (
    <div className="container mx-auto p-4">
      <div className="card bg-base-100 shadow-xl card-compact sm:card-normal">
        <div className="card-body">
          <h2 className="card-title">Status</h2>
          {pools.length === 0 ? (
            <p className="text-base-content/60">
              No per-pool data — ingestion isn&apos;t running in this instance.
            </p>
          ) : (
            <StatusTable
              pools={pools}
              showRejected={showRejected}
              showShareCounts={showShareCounts}
              staleMs={STALE_MS}
            />
          )}
        </div>
      </div>
    </div>
  );
}
