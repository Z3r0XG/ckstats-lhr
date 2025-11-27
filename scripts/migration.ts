import 'dotenv/config';
import { getDb } from '../lib/db_migration';

async function runMigrations() {
  console.log('Running migrations...');
  const ds = await getDb();
  try {
    const skipInitial = process.argv.includes('--skip-initial');
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

      // no-op: migration application summary printed above
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
