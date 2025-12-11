import { MigrationInterface, QueryRunner } from 'typeorm';

export class RefactorOnlineDevicesForPoolStatus1710000000009
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Remove best_active column (replaced by pool.status bestshare)
    await queryRunner.query(
      `ALTER TABLE "online_devices" DROP COLUMN IF EXISTS "best_active";`
    );

    // Add bestshare column to store best difficulty share per device from pool.status
    await queryRunner.query(
      `ALTER TABLE "online_devices" ADD COLUMN IF NOT EXISTS "bestshare" double precision NOT NULL DEFAULT 0;`
    );

    // Drop unused index on (window_minutes, rank)
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_online_devices_window_rank;`
    );

    // Remove rank column - UI computes rank from array index, DB doesn't need it
    await queryRunner.query(
      `ALTER TABLE "online_devices" DROP COLUMN IF EXISTS "rank";`
    );

    // Drop the old UNIQUE constraint that includes window_minutes
    await queryRunner.query(
      `ALTER TABLE "online_devices" DROP CONSTRAINT IF EXISTS "online_devices_client_window_minutes_key";`
    );

    // Remove window_minutes column - pool.status is always current, no time windows needed
    await queryRunner.query(
      `ALTER TABLE "online_devices" DROP COLUMN IF EXISTS "window_minutes";`
    );

    // Add new UNIQUE constraint on client only
    await queryRunner.query(
      `ALTER TABLE "online_devices" ADD CONSTRAINT "online_devices_client_key" UNIQUE (client);`
    );

    // Rename total_hashrate1hr to generic total_hashrate
    // This decouples the column name from any specific time window
    await queryRunner.query(
      `ALTER TABLE "online_devices" RENAME COLUMN "total_hashrate1hr" TO "total_hashrate";`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Restore original column name
    await queryRunner.query(
      `ALTER TABLE "online_devices" RENAME COLUMN "total_hashrate" TO "total_hashrate1hr";`
    );

    // Remove UNIQUE constraint on client only
    await queryRunner.query(
      `ALTER TABLE "online_devices" DROP CONSTRAINT IF EXISTS "online_devices_client_key";`
    );

    // Restore window_minutes column
    await queryRunner.query(
      `ALTER TABLE "online_devices" ADD COLUMN "window_minutes" integer NOT NULL DEFAULT 60;`
    );

    // Restore old UNIQUE constraint
    await queryRunner.query(
      `ALTER TABLE "online_devices" ADD CONSTRAINT "online_devices_client_window_minutes_key" UNIQUE (client, window_minutes);`
    );

    // Restore rank column
    await queryRunner.query(
      `ALTER TABLE "online_devices" ADD COLUMN "rank" integer;`
    );

    // Restore the index
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_online_devices_window_rank ON "online_devices" (window_minutes, rank);`
    );

    // Remove bestshare column
    await queryRunner.query(
      `ALTER TABLE "online_devices" DROP COLUMN IF EXISTS "bestshare";`
    );

    // Restore best_active column
    await queryRunner.query(
      `ALTER TABLE "online_devices" ADD COLUMN "best_active" double precision NOT NULL DEFAULT 0;`
    );
  }
}
