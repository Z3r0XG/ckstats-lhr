import { MigrationInterface, QueryRunner } from 'typeorm';

export class ChangeStatsIdToBigint1710000000021
  implements MigrationInterface
{
  name = 'ChangeStatsIdToBigint1710000000021';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "WorkerStats"
        ALTER COLUMN "id" TYPE bigint USING "id"::bigint;
    `);
    await queryRunner.query(`
      ALTER SEQUENCE "WorkerStats_id_seq" AS bigint;
    `);
    await queryRunner.query(`
      ALTER TABLE "UserStats"
        ALTER COLUMN "id" TYPE bigint USING "id"::bigint;
    `);
    await queryRunner.query(`
      ALTER SEQUENCE "UserStats_id_seq" AS bigint;
    `);
  }

  // Best-effort rollback. Narrowing bigint -> integer fails if any id (or the
  // sequence position) exceeds the int4 range (2147483647) — which is exactly
  // why up() widened these. This is intentionally unguarded: the migration
  // runner only applies up() migrations (scripts/migration.ts calls
  // runMigrations, never undoLastMigration), so down() is not reached in normal
  // operation. If you ever wire up revert, confirm MAX(id) and the sequence
  // last_value fit in int4 first.
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER SEQUENCE "UserStats_id_seq" AS integer;
    `);
    await queryRunner.query(`
      ALTER TABLE "UserStats"
        ALTER COLUMN "id" TYPE integer USING "id"::integer;
    `);
    await queryRunner.query(`
      ALTER SEQUENCE "WorkerStats_id_seq" AS integer;
    `);
    await queryRunner.query(`
      ALTER TABLE "WorkerStats"
        ALTER COLUMN "id" TYPE integer USING "id"::integer;
    `);
  }
}
