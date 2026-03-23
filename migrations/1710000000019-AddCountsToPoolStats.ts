import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCountsToPoolStats1710000000019 implements MigrationInterface {
  name = 'AddCountsToPoolStats1710000000019';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "PoolStats"
        ADD COLUMN IF NOT EXISTS "accepted_count" integer,
        ADD COLUMN IF NOT EXISTS "rejected_count" integer;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "PoolStats"
        DROP COLUMN IF EXISTS "accepted_count",
        DROP COLUMN IF EXISTS "rejected_count";
    `);
  }
}
