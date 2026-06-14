import { MigrationInterface, QueryRunner } from 'typeorm';

export class ChangePoolStatsCountsToBigint1710000000020
  implements MigrationInterface
{
  name = 'ChangePoolStatsCountsToBigint1710000000020';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "PoolStats"
        ALTER COLUMN "accepted_count" TYPE bigint USING "accepted_count"::bigint,
        ALTER COLUMN "rejected_count" TYPE bigint USING "rejected_count"::bigint;
    `);
  }

  // Best-effort rollback. Narrowing bigint -> integer fails if any value
  // exceeds the int4 range (2147483647) — which is exactly why up() widened
  // these columns (prod accepted_count already passed 2.4B). This is
  // intentionally unguarded: the migration runner only applies up() migrations
  // (scripts/migration.ts calls runMigrations, never undoLastMigration), so
  // down() is not reached in normal operation. If you ever wire up revert,
  // confirm MAX(accepted_count)/MAX(rejected_count) fit in int4 first.
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "PoolStats"
        ALTER COLUMN "accepted_count" TYPE integer USING "accepted_count"::integer,
        ALTER COLUMN "rejected_count" TYPE integer USING "rejected_count"::integer;
    `);
  }
}
