// Manual one-shot of the multi-pool ingest cycle — the SAME fast path the in-process loop runs
// (capture over persistent keep-alive connections → combine → write the combined tables), but once
// and then exit. Use for "fetch now" / testing instead of the legacy seed + update-users scripts
// (which use the old per-request fetch path). CLI preloads env via `-r dotenv/config`.
//
//   pnpm ingest                      # run against whatever DB_NAME/.env points at
//   DB_NAME=ckstats_scratch pnpm ingest   # test in isolation without touching prod
//
// NOTE: if the service's in-process loop is also running against the same DB, both will write — for
// a clean test point DB_NAME at a scratch DB (or set POOL_INGEST=0 and restart to pause the loop).
import 'reflect-metadata';

import { getDb } from '../lib/db';
import { runCycle } from '../lib/ingest';

(async () => {
  const t0 = Date.now();
  const r = await runCycle();
  console.log(
    `ingest cycle complete: ${r.pools} pools, ${r.users} users in ${((Date.now() - t0) / 1000).toFixed(1)}s`
  );
  const db = await getDb();
  await db.destroy();
  process.exit(0);
})().catch((error) => {
  console.error('ingest cycle failed:', error);
  process.exit(1);
});
