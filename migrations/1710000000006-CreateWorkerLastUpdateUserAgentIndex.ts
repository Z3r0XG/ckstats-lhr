import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateWorkerLastUpdateUserAgentIndex1710000000006
  implements MigrationInterface
{
  name = 'CreateWorkerLastUpdateUserAgentIndex1710000000006';

  // This migration must not run inside a transaction because
  // CREATE INDEX CONCURRENTLY cannot be executed in a transaction.
  // TypeORM's migration runner recognizes the `transaction` property
  // when set to false and will run this migration without a surrounding
  // transaction when `runMigrations({ transaction: 'each' })` is used.
  public readonly transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create the index concurrently to avoid locking the entire table
    // on large production datasets.
    await queryRunner.query(
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_Worker_lastUpdate_userAgent" ON "Worker" ("lastUpdate", "userAgent")`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX CONCURRENTLY IF EXISTS "IDX_Worker_lastUpdate_userAgent"`
    );
  }
}
