import { MigrationInterface, QueryRunner } from 'typeorm';

export class ConvertWorkerLastUpdateToTimestamptz1710000000007 implements MigrationInterface {
  name = 'ConvertWorkerLastUpdateToTimestamptz1710000000007';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Convert existing Worker.lastUpdate (timestamp without time zone)
    // into timestamptz interpreted as UTC. This treats the stored
    // values as if they were UTC-local timestamps and converts them
    // into proper timestamptz values.
    await queryRunner.query(`
      ALTER TABLE "Worker"
      ALTER COLUMN "lastUpdate" TYPE TIMESTAMPTZ
      USING "lastUpdate" AT TIME ZONE 'UTC'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Revert back to timestamp without time zone (lossy w.r.t timezone info)
    await queryRunner.query(`
      ALTER TABLE "Worker"
      ALTER COLUMN "lastUpdate" TYPE TIMESTAMP
    `);
  }
}
