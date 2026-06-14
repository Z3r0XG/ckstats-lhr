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
