import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateOnlineDevicesTable1710000000005 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "online_devices" (
        id SERIAL PRIMARY KEY,
        client varchar(64) NOT NULL,
        active_workers integer NOT NULL DEFAULT 0,
        total_hashrate1hr double precision NOT NULL DEFAULT 0,
        window_minutes integer NOT NULL DEFAULT 60,
        rank integer,
        computed_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (client, window_minutes)
      );`
    );

    // Index to speed lookups by window and rank
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_online_devices_window_rank ON "online_devices" (window_minutes, rank);`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_online_devices_window_rank;`
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "online_devices";`);
  }
}
