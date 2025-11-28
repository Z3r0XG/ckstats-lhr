import 'dotenv/config';
import * as readline from 'readline';

import { getDb } from '../lib/db_migration';

async function askConfirmation(message: string): Promise<boolean> {
  if (
    process.env.CI ||
    process.env.SKIP_MIGRATION_CONFIRM === '1' ||
    process.argv.includes('--yes')
  ) {
    return true;
  }

  if (!process.stdin.isTTY) return false;

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const question = (q: string) =>
    new Promise<string>((resolve) => {
      rl.question(q, (ans) => resolve(ans));
    });

  const answer = await question(`${message} Proceed? (y/N): `);
  rl.close();
  return ['y', 'Y', 'yes', 'YES'].includes(answer.trim());
}

async function runMigrations() {
  console.log('Running migrations...');
  const ds = await getDb();
  try {
    const skipInitial = process.argv.includes('--skip-initial');

    let pending: string[] = [];
    try {
      const existsRes: Array<{ rt: string | null }> = await ds.query(
        "SELECT to_regclass('public.migrations') AS rt"
      );
      const migrationsTableExists =
        existsRes && existsRes[0] && existsRes[0].rt;

      let executed: Set<string> = new Set();
      if (migrationsTableExists) {
        const executedRows: Array<{ name: string }> = await ds.query(
          'SELECT name FROM migrations'
        );
        executed = new Set(executedRows.map((r) => r.name));
      } else {
        executed = new Set();
      }
      const fs = await import('fs');
      const path = await import('path');
      const migrationsDir = path.resolve(__dirname, '..', 'migrations');
      const files = fs
        .readdirSync(migrationsDir)
        .filter((f) => f.endsWith('.ts') || f.endsWith('.js'));
      const available: string[] = [];
      for (const f of files) {
        try {
          const content = fs.readFileSync(path.join(migrationsDir, f), 'utf8');
          const m = content.match(/export\s+class\s+(\w+)/);
          if (m && m[1]) available.push(m[1]);
          else available.push(path.basename(f, path.extname(f)));
        } catch {
          available.push(path.basename(f, path.extname(f)));
        }
      }
      
        pending = available.filter((n: string) => !executed.has(n));

      if (pending.length === 0) {
        console.log('\nNo pending migrations detected.');
      } else {
        console.log('\nPending migrations to be applied:');
        pending.forEach((p: string) => console.log(`- ${p}`));
      }
    } catch (err) {
      console.warn(
        'Could not enumerate pending migrations:',
        err instanceof Error ? err.message : String(err)
      );
    }

      // If no pending migrations were found, skip the interactive prompt.
      if (pending.length === 0) {
        if (ds && ds.isInitialized) await ds.destroy();
        console.log('\nNo pending migrations to run');
        return;
      }
    const warning =
      `WARNING: This script will update your database. On new deployments it should run very quickly.\n` +
      `For existing deployments, especially those with large data sets this can take significant time.\n` +
      `If you are running this on a production database, consider scheduling during a low-traffic window.`;

    const ok = await askConfirmation(warning);
    if (!ok) {
      console.log('Migration aborted by user.');
      if (ds && ds.isInitialized) await ds.destroy();
      process.exit(0);
    }
    if (skipInitial) {
      const initialMigrationName = 'InitialMigration1710000000000';
      const existingMigrations = await ds.query(
        'SELECT * FROM migrations WHERE name = $1',
        [initialMigrationName]
      );
      if (existingMigrations.length === 0) {
        await ds.query(
          'INSERT INTO migrations (timestamp, name) VALUES ($1, $2)',
          ['1710000000000', initialMigrationName]
        );
        console.log(`Skipped migration: ${initialMigrationName}`);
      } else {
        console.log(
          `Migration ${initialMigrationName} is already marked as executed.`
        );
      }
    }

    const migrations = await ds.runMigrations({ transaction: 'each' });
    if (migrations.length === 0) console.log('\nNo pending migrations to run');
    else {
      console.log('\nNewly applied migrations:');
      migrations.forEach((m: any) => console.log(`- ${m.name}`));
    }

    console.log('\nMigration process completed');
  } finally {
    if (ds && ds.isInitialized) await ds.destroy();
  }
}

runMigrations().catch((e) => {
  console.error('Migration runner error:', e && (e.message || e));
  process.exit(1);
});
