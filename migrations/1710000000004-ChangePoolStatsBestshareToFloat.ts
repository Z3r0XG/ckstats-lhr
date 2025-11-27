import { MigrationInterface, QueryRunner } from 'typeorm';

export class ChangePoolStatsBestshareToFloat1710000000004
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "PoolStats" ALTER COLUMN "bestshare" TYPE double precision USING "bestshare"::double precision;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "PoolStats" ALTER COLUMN "bestshare" TYPE bigint USING "bestshare"::bigint;
    `);
  }
}
