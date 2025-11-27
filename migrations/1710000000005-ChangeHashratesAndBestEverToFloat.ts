import { MigrationInterface, QueryRunner } from 'typeorm';

export class ChangeHashratesAndBestEverToFloat1710000000005
  implements MigrationInterface
{
  name = 'ChangeHashratesAndBestEverToFloat1710000000005';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "PoolStats" ALTER COLUMN "hashrate1m" TYPE double precision USING "hashrate1m"::double precision;`
    );
    await queryRunner.query(
      `ALTER TABLE "PoolStats" ALTER COLUMN "hashrate5m" TYPE double precision USING "hashrate5m"::double precision;`
    );
    await queryRunner.query(
      `ALTER TABLE "PoolStats" ALTER COLUMN "hashrate15m" TYPE double precision USING "hashrate15m"::double precision;`
    );
    await queryRunner.query(
      `ALTER TABLE "PoolStats" ALTER COLUMN "hashrate1hr" TYPE double precision USING "hashrate1hr"::double precision;`
    );
    await queryRunner.query(
      `ALTER TABLE "PoolStats" ALTER COLUMN "hashrate6hr" TYPE double precision USING "hashrate6hr"::double precision;`
    );
    await queryRunner.query(
      `ALTER TABLE "PoolStats" ALTER COLUMN "hashrate1d" TYPE double precision USING "hashrate1d"::double precision;`
    );
    await queryRunner.query(
      `ALTER TABLE "PoolStats" ALTER COLUMN "hashrate7d" TYPE double precision USING "hashrate7d"::double precision;`
    );
    await queryRunner.query(
      `ALTER TABLE "PoolStats" ALTER COLUMN "bestshare" TYPE double precision USING "bestshare"::double precision;`
    );

    await queryRunner.query(
      `ALTER TABLE "UserStats" ALTER COLUMN "hashrate1m" TYPE double precision USING "hashrate1m"::double precision;`
    );
    await queryRunner.query(
      `ALTER TABLE "UserStats" ALTER COLUMN "hashrate5m" TYPE double precision USING "hashrate5m"::double precision;`
    );
    await queryRunner.query(
      `ALTER TABLE "UserStats" ALTER COLUMN "hashrate1hr" TYPE double precision USING "hashrate1hr"::double precision;`
    );
    await queryRunner.query(
      `ALTER TABLE "UserStats" ALTER COLUMN "hashrate1d" TYPE double precision USING "hashrate1d"::double precision;`
    );
    await queryRunner.query(
      `ALTER TABLE "UserStats" ALTER COLUMN "hashrate7d" TYPE double precision USING "hashrate7d"::double precision;`
    );
    await queryRunner.query(
      `ALTER TABLE "UserStats" ALTER COLUMN "bestEver" TYPE double precision USING "bestEver"::double precision;`
    );

    await queryRunner.query(
      `ALTER TABLE "Worker" ALTER COLUMN "hashrate1m" TYPE double precision USING "hashrate1m"::double precision;`
    );
    await queryRunner.query(
      `ALTER TABLE "Worker" ALTER COLUMN "hashrate5m" TYPE double precision USING "hashrate5m"::double precision;`
    );
    await queryRunner.query(
      `ALTER TABLE "Worker" ALTER COLUMN "hashrate1hr" TYPE double precision USING "hashrate1hr"::double precision;`
    );
    await queryRunner.query(
      `ALTER TABLE "Worker" ALTER COLUMN "hashrate1d" TYPE double precision USING "hashrate1d"::double precision;`
    );
    await queryRunner.query(
      `ALTER TABLE "Worker" ALTER COLUMN "hashrate7d" TYPE double precision USING "hashrate7d"::double precision;`
    );
    await queryRunner.query(
      `ALTER TABLE "Worker" ALTER COLUMN "bestEver" TYPE double precision USING "bestEver"::double precision;`
    );

    await queryRunner.query(
      `ALTER TABLE "WorkerStats" ALTER COLUMN "hashrate1m" TYPE double precision USING "hashrate1m"::double precision;`
    );
    await queryRunner.query(
      `ALTER TABLE "WorkerStats" ALTER COLUMN "hashrate5m" TYPE double precision USING "hashrate5m"::double precision;`
    );
    await queryRunner.query(
      `ALTER TABLE "WorkerStats" ALTER COLUMN "hashrate1hr" TYPE double precision USING "hashrate1hr"::double precision;`
    );
    await queryRunner.query(
      `ALTER TABLE "WorkerStats" ALTER COLUMN "hashrate1d" TYPE double precision USING "hashrate1d"::double precision;`
    );
    await queryRunner.query(
      `ALTER TABLE "WorkerStats" ALTER COLUMN "hashrate7d" TYPE double precision USING "hashrate7d"::double precision;`
    );
    await queryRunner.query(
      `ALTER TABLE "WorkerStats" ALTER COLUMN "bestEver" TYPE double precision USING "bestEver"::double precision;`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "WorkerStats" ALTER COLUMN "bestEver" TYPE bigint USING round("bestEver")::bigint;`
    );
    await queryRunner.query(
      `ALTER TABLE "WorkerStats" ALTER COLUMN "hashrate7d" TYPE bigint USING round("hashrate7d")::bigint;`
    );
    await queryRunner.query(
      `ALTER TABLE "WorkerStats" ALTER COLUMN "hashrate1d" TYPE bigint USING round("hashrate1d")::bigint;`
    );
    await queryRunner.query(
      `ALTER TABLE "WorkerStats" ALTER COLUMN "hashrate1hr" TYPE bigint USING round("hashrate1hr")::bigint;`
    );
    await queryRunner.query(
      `ALTER TABLE "WorkerStats" ALTER COLUMN "hashrate5m" TYPE bigint USING round("hashrate5m")::bigint;`
    );
    await queryRunner.query(
      `ALTER TABLE "WorkerStats" ALTER COLUMN "hashrate1m" TYPE bigint USING round("hashrate1m")::bigint;`
    );

    await queryRunner.query(
      `ALTER TABLE "Worker" ALTER COLUMN "bestEver" TYPE bigint USING round("bestEver")::bigint;`
    );
    await queryRunner.query(
      `ALTER TABLE "Worker" ALTER COLUMN "hashrate7d" TYPE bigint USING round("hashrate7d")::bigint;`
    );
    await queryRunner.query(
      `ALTER TABLE "Worker" ALTER COLUMN "hashrate1d" TYPE bigint USING round("hashrate1d")::bigint;`
    );
    await queryRunner.query(
      `ALTER TABLE "Worker" ALTER COLUMN "hashrate1hr" TYPE bigint USING round("hashrate1hr")::bigint;`
    );
    await queryRunner.query(
      `ALTER TABLE "Worker" ALTER COLUMN "hashrate5m" TYPE bigint USING round("hashrate5m")::bigint;`
    );
    await queryRunner.query(
      `ALTER TABLE "Worker" ALTER COLUMN "hashrate1m" TYPE bigint USING round("hashrate1m")::bigint;`
    );

    await queryRunner.query(
      `ALTER TABLE "UserStats" ALTER COLUMN "bestEver" TYPE bigint USING round("bestEver")::bigint;`
    );
    await queryRunner.query(
      `ALTER TABLE "UserStats" ALTER COLUMN "hashrate7d" TYPE bigint USING round("hashrate7d")::bigint;`
    );
    await queryRunner.query(
      `ALTER TABLE "UserStats" ALTER COLUMN "hashrate1d" TYPE bigint USING round("hashrate1d")::bigint;`
    );
    await queryRunner.query(
      `ALTER TABLE "UserStats" ALTER COLUMN "hashrate1hr" TYPE bigint USING round("hashrate1hr")::bigint;`
    );
    await queryRunner.query(
      `ALTER TABLE "UserStats" ALTER COLUMN "hashrate5m" TYPE bigint USING round("hashrate5m")::bigint;`
    );
    await queryRunner.query(
      `ALTER TABLE "UserStats" ALTER COLUMN "hashrate1m" TYPE bigint USING round("hashrate1m")::bigint;`
    );

    await queryRunner.query(
      `ALTER TABLE "PoolStats" ALTER COLUMN "bestshare" TYPE bigint USING round("bestshare")::bigint;`
    );
    await queryRunner.query(
      `ALTER TABLE "PoolStats" ALTER COLUMN "hashrate7d" TYPE bigint USING round("hashrate7d")::bigint;`
    );
    await queryRunner.query(
      `ALTER TABLE "PoolStats" ALTER COLUMN "hashrate1d" TYPE bigint USING round("hashrate1d")::bigint;`
    );
    await queryRunner.query(
      `ALTER TABLE "PoolStats" ALTER COLUMN "hashrate6hr" TYPE bigint USING round("hashrate6hr")::bigint;`
    );
    await queryRunner.query(
      `ALTER TABLE "PoolStats" ALTER COLUMN "hashrate1hr" TYPE bigint USING round("hashrate1hr")::bigint;`
    );
    await queryRunner.query(
      `ALTER TABLE "PoolStats" ALTER COLUMN "hashrate15m" TYPE bigint USING round("hashrate15m")::bigint;`
    );
    await queryRunner.query(
      `ALTER TABLE "PoolStats" ALTER COLUMN "hashrate5m" TYPE bigint USING round("hashrate5m")::bigint;`
    );
    await queryRunner.query(
      `ALTER TABLE "PoolStats" ALTER COLUMN "hashrate1m" TYPE bigint USING round("hashrate1m")::bigint;`
    );
  }
}
