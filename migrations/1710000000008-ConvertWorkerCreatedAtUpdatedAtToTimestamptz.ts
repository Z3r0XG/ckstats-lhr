import { MigrationInterface, QueryRunner } from 'typeorm';

export class ConvertWorkerCreatedAtUpdatedAtToTimestamptz1710000000008 implements MigrationInterface {
  name = 'ConvertWorkerCreatedAtUpdatedAtToTimestamptz1710000000008';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Convert existing Worker.createdAt and updatedAt (timestamp without time zone)
    // into timestamptz interpreted as UTC. This treats the stored
    // values as if they were UTC-local timestamps and converts them
    // into proper timestamptz values.
    await queryRunner.query(`
      ALTER TABLE "Worker"
      ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ
      USING "createdAt" AT TIME ZONE 'UTC'
    `);
    await queryRunner.query(`
      ALTER TABLE "Worker"
      ALTER COLUMN "updatedAt" TYPE TIMESTAMPTZ
      USING "updatedAt" AT TIME ZONE 'UTC'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Revert back to timestamp without time zone (lossy w.r.t timezone info)
    await queryRunner.query(`
      ALTER TABLE "Worker"
      ALTER COLUMN "createdAt" TYPE TIMESTAMP
    `);
    await queryRunner.query(`
      ALTER TABLE "Worker"
      ALTER COLUMN "updatedAt" TYPE TIMESTAMP
    `);
  }
}