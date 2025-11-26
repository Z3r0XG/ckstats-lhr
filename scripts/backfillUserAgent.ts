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

  try {
    // Reuse the existing `updateSingleUser` logic for each address.
    let addrRows: Array<{ userAddress: string }> = [];
    try {
      addrRows = await db.query('SELECT DISTINCT "userAddress" FROM "Worker"');
    } catch (err) {
      console.error('Failed to query distinct userAddress from DB', err);
      throw err;
    }

    for (const r of addrRows) {
      const address = (r as any).userAddress || (r as any).useraddress || Object.values(r)[0];
      if (dryRun) {
        wouldUpdate++;
        console.log(`Would update user ${address}`);
        continue;
      }

      try {
        await updateSingleUser(address);
        updated++;
      } catch (err) {
        errors++;
        console.error('Error updating user', address, err);
      }
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
