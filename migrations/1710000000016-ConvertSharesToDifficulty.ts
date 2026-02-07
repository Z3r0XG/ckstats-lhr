import { MigrationInterface, QueryRunner } from 'typeorm';

export class ConvertSharesToDifficulty1710000000016
  implements MigrationInterface
{
  name = 'ConvertSharesToDifficulty1710000000016';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Convert PoolStats.accepted and rejected from bigint to double precision
    await queryRunner.query(
      `ALTER TABLE "PoolStats" ALTER COLUMN "accepted" TYPE double precision USING "accepted"::double precision`
    );
    await queryRunner.query(
      `ALTER TABLE "PoolStats" ALTER COLUMN "rejected" TYPE double precision USING "rejected"::double precision`
    );

    // Convert UserStats.shares from bigint to double precision
    await queryRunner.query(
      `ALTER TABLE "UserStats" ALTER COLUMN "shares" TYPE double precision USING "shares"::double precision`
    );
    await queryRunner.query(
      `ALTER TABLE "UserStats" ALTER COLUMN "shares" SET DEFAULT 0`
    );

    // Convert WorkerStats.shares from bigint to double precision
    await queryRunner.query(
      `ALTER TABLE "WorkerStats" ALTER COLUMN "shares" TYPE double precision USING "shares"::double precision`
    );
    await queryRunner.query(
      `ALTER TABLE "WorkerStats" ALTER COLUMN "shares" SET DEFAULT 0`
    );

    // Convert Worker.shares from bigint to double precision
    await queryRunner.query(
      `ALTER TABLE "Worker" ALTER COLUMN "shares" TYPE double precision USING "shares"::double precision`
    );
    await queryRunner.query(
      `ALTER TABLE "Worker" ALTER COLUMN "shares" SET DEFAULT 0`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Revert Worker.shares to bigint
    await queryRunner.query(
      `ALTER TABLE "Worker" ALTER COLUMN "shares" TYPE bigint USING FLOOR("shares")::bigint`
    );
    await queryRunner.query(
      `ALTER TABLE "Worker" ALTER COLUMN "shares" SET DEFAULT '0'`
    );

    // Revert WorkerStats.shares to bigint
    await queryRunner.query(
      `ALTER TABLE "WorkerStats" ALTER COLUMN "shares" TYPE bigint USING FLOOR("shares")::bigint`
    );
    await queryRunner.query(
      `ALTER TABLE "WorkerStats" ALTER COLUMN "shares" SET DEFAULT '0'`
    );

    // Revert UserStats.shares to bigint
    await queryRunner.query(
      `ALTER TABLE "UserStats" ALTER COLUMN "shares" TYPE bigint USING FLOOR("shares")::bigint`
    );
    await queryRunner.query(
      `ALTER TABLE "UserStats" ALTER COLUMN "shares" SET DEFAULT '0'`
    );

    // Revert PoolStats.rejected to bigint
    await queryRunner.query(
      `ALTER TABLE "PoolStats" ALTER COLUMN "rejected" TYPE bigint USING FLOOR("rejected")::bigint`
    );

    // Revert PoolStats.accepted to bigint
    await queryRunner.query(
      `ALTER TABLE "PoolStats" ALTER COLUMN "accepted" TYPE bigint USING FLOOR("accepted")::bigint`
    );
  }
}
