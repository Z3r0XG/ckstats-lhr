import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateTopBestDiffsTable1710000000010 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "top_best_diffs" (
        id SERIAL PRIMARY KEY,
        rank integer NOT NULL,
        difficulty double precision NOT NULL,
        device varchar(256),
        timestamp timestamptz NOT NULL,
        computed_at timestamptz NOT NULL DEFAULT now()
      );`
    );

    // Index for fast lookups
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_top_best_diffs_rank ON "top_best_diffs" (rank);`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_top_best_diffs_rank;`
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "top_best_diffs";`);
  }
}
