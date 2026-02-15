import { MigrationInterface, QueryRunner } from 'typeorm';

export class ExpandUserAgentVarcharColumns1710000000018 implements MigrationInterface {
  name = 'ExpandUserAgentVarcharColumns1710000000018';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Expand Worker.userAgent from varchar(64) to varchar(256)
    // This prevents truncation of longer device names (e.g., "NerdOCTAXE-γ")
    await queryRunner.query(
      `ALTER TABLE "Worker" ALTER COLUMN "userAgent" TYPE varchar(256)`
    );
    
    // Expand online_devices.client from varchar(64) to varchar(256)
    // This ensures consistency with Worker.userAgent and prevents truncation
    // when seed.ts copies data from Worker to online_devices
    await queryRunner.query(
      `ALTER TABLE "online_devices" ALTER COLUMN "client" TYPE varchar(256)`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Note: Downgrading back to varchar(64) may truncate data
    await queryRunner.query(
      `ALTER TABLE "online_devices" ALTER COLUMN "client" TYPE varchar(64)`
    );
    
    await queryRunner.query(
      `ALTER TABLE "Worker" ALTER COLUMN "userAgent" TYPE varchar(64)`
    );
  }
}
