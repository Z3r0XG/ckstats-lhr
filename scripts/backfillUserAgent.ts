import 'dotenv/config';
// local file access removed; script is API-only and reuses the app API
import { getDb } from '../lib/db';
import { updateSingleUser } from '../lib/api';

// use canonical normalization from lib/api

export async function main(opts?: { dryRun?: boolean }) {
  const dryRun = opts?.dryRun === true || process.argv.includes('--dry-run') || process.argv.includes('-n');

  // Delegate to `updateSingleUser` which knows how to fetch user data.
  // This script intentionally does not require `API_URL` or any log
  // directory — it simply iterates DB addresses and calls the app's
  // update logic which handles fetching from configured sources.

  const db = await getDb();
  let updated = 0;
  let wouldUpdate = 0;
  let errors = 0;
  let processedCount = 0;
  // Tuned fixed concurrency: balances parallelism and resource usage.
  // Chosen value: 16 — high enough to utilize I/O concurrency without
  // overwhelming typical API/DB endpoints for medium-to-large pools.
  const CONCURRENCY = 16;

  try {
    // Reuse the existing `updateSingleUser` logic for each address.
    let addrRows: Array<{ address: string }> = [];
    try {
      addrRows = await db.query('SELECT DISTINCT "userAddress" as address FROM "Worker"');
    } catch (err) {
      console.error('Failed to query distinct userAddress from DB', err);
      throw err;
    }

    const addresses = addrRows.map((r: any) => String(r.address));

    // Process in batches to limit concurrency and avoid overloading API/DB
    for (let i = 0; i < addresses.length; i += CONCURRENCY) {
      const batch = addresses.slice(i, i + CONCURRENCY);
      await Promise.all(
        batch.map(async (address) => {
          if (dryRun) {
            try {
              const would = await updateSingleUser(address, { dryRun: true });
              if (would) wouldUpdate++;
            } catch (err) {
              errors++;
            }
            return;
          }

          try {
            const changed = await updateSingleUser(address);
            if (changed) updated++;
          } catch (err) {
            errors++;
          }
        })
      );

      processedCount += batch.length;

      const summary = dryRun
        ? `Processed ${processedCount}/${addresses.length} — would update ${wouldUpdate} — errors ${errors}`
        : `Processed ${processedCount}/${addresses.length} — updated ${updated} — errors ${errors}`;

      console.log(summary);
    }
  } finally {
    // ensure DB connection is closed
    try {
      if (db && (db as any).isInitialized) await (db as any).destroy();
    } catch (err) {
      // ignore cleanup errors but log
      console.error('Error closing DB connection', err);
    }
  }

  if (dryRun) {
    console.log(`Dry-run complete. Addresses: ${wouldUpdate}`);
  } else {
    console.log(`Backfill complete. Updated: ${updated}, Errors: ${errors}`);
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Backfill failed:', err);
    process.exit(2);
  });
}
