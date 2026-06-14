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

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "PoolStats"
        ALTER COLUMN "accepted_count" TYPE integer USING "accepted_count"::integer,
        ALTER COLUMN "rejected_count" TYPE integer USING "rejected_count"::integer;
    `);
  }
}
