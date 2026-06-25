// Manual one-shot of the ingest cycle — the SAME path the in-process loop runs (capture over
// persistent keep-alive connections → combine → write the combined tables), but once and then exit.
// An optional arg selects the half (pool.status and users are different endpoints, so each half only
// fetches its own): `stats` = pool stats, `users` = user/worker stats, none = both. This is what the
// `seed` / `update-users` / `ingest` package scripts invoke. CLI preloads env via `-r dotenv/config`.
//
//   pnpm ingest                           # full cycle (both halves)
//   pnpm seed                             # stats half  (ingestOnce stats)
//   pnpm update-users                     # users half  (ingestOnce users)
//   DB_NAME=other_db pnpm ingest          # run against a different database
//
// NOTE: if the in-process loop (POOL_INGEST) is also running against the same DB, both will write —
// drive ingestion with EITHER the cron scripts OR the loop, not both.
import 'reflect-metadata';

import { getDb } from '../lib/db';
import { runCycle, runStatsCycle, runUsersCycle } from '../lib/ingest';

(async () => {
  const mode = process.argv[2]; // 'stats' | 'users' | undefined (both)
  const t0 = Date.now();
  // Each cycle returns null if another ingester holds the per-database advisory lock (don't run this
  // alongside the in-process loop) — report that rather than crashing on a null.
  const skipped = 'skipped (another ingest is running against this database)';
  let summary: string;
  if (mode === 'stats') {
    const r = await runStatsCycle();
    summary = r ? `${r.pools} pools (stats)` : skipped;
  } else if (mode === 'users') {
    const r = await runUsersCycle();
    summary = r ? `${r.users} users` : skipped;
  } else {
    const r = await runCycle();
    summary = r ? `${r.pools} pools, ${r.users} users` : skipped;
  }
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(
    `ingest ${mode ?? 'full'} cycle complete: ${summary} in ${secs}s`
  );
  const db = await getDb();
  await db.destroy();
  process.exit(0);
})().catch((error) => {
  console.error('ingest cycle failed:', error);
  process.exit(1);
});
