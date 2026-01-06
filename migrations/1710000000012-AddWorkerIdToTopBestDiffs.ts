import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWorkerIdToTopBestDiffs1710000000012 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "top_best_diffs" ADD COLUMN "workerId" integer;`
    );

    // Best-effort backfill: match by difficulty + userAgent
    await queryRunner.query(`
      WITH matches AS (
        SELECT t.id AS tid, w.id AS wid,
               ROW_NUMBER() OVER (PARTITION BY t.id ORDER BY w."updatedAt" DESC) AS rn
        FROM "top_best_diffs" t
        JOIN "Worker" w
          ON w."bestEver" = t.difficulty
         AND COALESCE(w."userAgent", 'Other') = COALESCE(t.device, 'Other')
      )
      UPDATE "top_best_diffs" t
      SET "workerId" = m.wid
      FROM matches m
      WHERE m.rn = 1 AND m.tid = t.id;
    `);

    // Enforce uniqueness per worker when workerId is known
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_top_best_diffs_workerId
         ON "top_best_diffs" ("workerId")
         WHERE "workerId" IS NOT NULL;`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_top_best_diffs_workerId;`
    );
    await queryRunner.query(
      `ALTER TABLE "top_best_diffs" DROP COLUMN "workerId";`
    );
  }
}