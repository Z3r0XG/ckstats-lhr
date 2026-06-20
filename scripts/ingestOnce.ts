// Manual one-shot of the ingest cycle — the SAME path the in-process loop runs (capture over
// persistent keep-alive connections → combine → write the combined tables), but once and then exit.
// An optional arg selects the half (pool.status and users are different endpoints, so each half only
// fetches its own): `stats` = pool stats, `users` = user/worker stats, none = both. This is what the
// `seed` / `update-users` / `ingest` package scripts invoke. CLI preloads env via `-r dotenv/config`.
//
//   pnpm ingest                           # full cycle (both halves)
//   pnpm seed                             # stats half  (ingestOnce stats)
//   pnpm update-users                     # users half  (ingestOnce users)
//   DB_NAME=ckstats_scratch pnpm ingest   # run against a scratch DB without touching prod
//
// NOTE: if the in-process loop (POOL_INGEST) is also running against the same DB, both will write —
// drive ingestion with EITHER the cron scripts OR the loop, not both.
import 'reflect-metadata';

import { getDb } from '../lib/db';
import { runCycle, runStatsCycle, runUsersCycle } from '../lib/ingest';

(async () => {
  const mode = process.argv[2]; // 'stats' | 'users' | undefined (both)
  const t0 = Date.now();
  let summary: string;
  if (mode === 'stats') {
    summary = `${(await runStatsCycle()).pools} pools (stats)`;
  } else if (mode === 'users') {
    summary = `${(await runUsersCycle()).users} users`;
  } else {
    const r = await runCycle();
    summary = `${r.pools} pools, ${r.users} users`;
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
