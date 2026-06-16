import { MigrationInterface, QueryRunner } from 'typeorm';

export class MakeTopBestDiffsImmutableLedger1710000000022
  implements MigrationInterface
{
  name = 'MakeTopBestDiffsImmutableLedger1710000000022';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Converts top_best_diffs into an IMMUTABLE LEDGER of best-ever-per-worker.
    //
    // Identity is keyed on (user_address, worker_name) — the pool's natural worker key
    // (wallet + optional ".worker_name") — NOT on workerId. workerId is a fresh
    // auto-increment each time a deleted/idle worker is re-imported, so keying on it let
    // the same all-time best re-enter under a new id (a duplicate leaderboard row).
    //
    // Records are never trimmed: a score can only be pushed out of the displayed window by
    // higher scores, never lost — even if its worker is later deleted in ckstats or its file
    // disappears from ckpool (there is no FK on workerId, and nothing deletes from this table).
    // The displayed "top N" is computed at read time (ORDER BY difficulty DESC LIMIT N), so the
    // stored `rank` and the old refresh's `computed_at` throttle marker are obsolete.

    // 1. Identity columns.
    await queryRunner.query(`
      ALTER TABLE "top_best_diffs" ADD COLUMN IF NOT EXISTS "user_address" varchar(256);
    `);
    await queryRunner.query(`
      ALTER TABLE "top_best_diffs" ADD COLUMN IF NOT EXISTS "worker_name" varchar(256);
    `);

    // 2. Backfill identity onto existing rows from their (still-present) worker. Rows whose
    //    worker was already deleted ("ghost" scores) keep NULL identity and are left for a
    //    manual review — we can't prove an old ghost is a dupe vs. a coincidence.
    await queryRunner.query(`
      UPDATE "top_best_diffs" t
      SET "user_address" = w."userAddress",
          "worker_name"  = w."name"
      FROM "Worker" w
      WHERE w.id = t."workerId";
    `);

    // 3. New uniqueness key, replacing workerId. Partial (NOT NULL) so NULL-identity ghosts
    //    never collide. workerId is kept as an informational pointer only.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "idx_top_best_diffs_identity"
        ON "top_best_diffs" ("user_address", "worker_name")
        WHERE "user_address" IS NOT NULL;
    `);
    // NOTE: migration 012 created this index UNQUOTED, so drop it unquoted to match the
    // lowercased name Postgres actually stored.
    await queryRunner.query(`DROP INDEX IF EXISTS idx_top_best_diffs_workerId;`);

    // 4. Drop the obsolete columns BEFORE the keep-all backfill — rank is NOT NULL with no
    //    default, so inserting new rows while it exists would fail. rank was maintained by the
    //    now-removed re-rank/trim step; computed_at was the hourly-refresh throttle marker (no
    //    periodic refresh in the event-driven model). idx_top_best_diffs_rank goes with rank.
    await queryRunner.query(`DROP INDEX IF EXISTS idx_top_best_diffs_rank;`);
    await queryRunner.query(`ALTER TABLE "top_best_diffs" DROP COLUMN IF EXISTS rank;`);
    await queryRunner.query(`ALTER TABLE "top_best_diffs" DROP COLUMN IF EXISTS computed_at;`);

    // 5. Seed the ledger from EVERY scored worker. Previously the table was trimmed to the
    //    top 10; this books the rest so the full best-ever-per-worker history is on the books
    //    from here forward. Guarded upsert on identity merges with the rows backfilled in
    //    step 2 without creating duplicates or downgrading a recorded score.
    await queryRunner.query(`
      INSERT INTO "top_best_diffs" ("workerId", "user_address", "worker_name", difficulty, device, "timestamp")
      SELECT w.id, w."userAddress", w."name", w."bestEver", COALESCE(w."userAgent", 'Other'), now()
      FROM "Worker" w
      WHERE w."bestEver" > 0
      ON CONFLICT ("user_address", "worker_name") WHERE "user_address" IS NOT NULL DO UPDATE
        SET difficulty  = EXCLUDED.difficulty,
            device      = EXCLUDED.device,
            "timestamp" = now(),
            "workerId"  = EXCLUDED."workerId"
        WHERE EXCLUDED.difficulty > "top_best_diffs".difficulty;
    `);

    // 6. Read-path index: matches the leaderboard's ORDER BY difficulty DESC, "timestamp" ASC,
    //    id ASC exactly, so the displayed top-N is an index scan with no separate sort step. The
    //    id column makes ordering fully deterministic even when difficulty AND timestamp coincide
    //    (the backfill above stamps every row with a single now()).
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_top_best_diffs_difficulty
        ON "top_best_diffs" (difficulty DESC, "timestamp" ASC, id ASC);
    `);
  }

  // Down is provided for lint/parity only; the runner applies up() migrations exclusively
  // (it never calls undoLastMigration). The step-5 keep-all backfill (and the step-2 identity
  // backfill) are not reversible (we can't know which rows pre-existed) and the dropped
  // rank/computed_at values can't be restored — down() only recreates the dropped schema, empty.
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "top_best_diffs" ADD COLUMN IF NOT EXISTS computed_at timestamptz NOT NULL DEFAULT now();
    `);
    await queryRunner.query(`
      ALTER TABLE "top_best_diffs" ADD COLUMN IF NOT EXISTS rank integer NOT NULL DEFAULT 0;
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_top_best_diffs_rank ON "top_best_diffs" (rank);
    `);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_top_best_diffs_difficulty;`);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_top_best_diffs_workerId
        ON "top_best_diffs" ("workerId")
        WHERE "workerId" IS NOT NULL;
    `);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_top_best_diffs_identity";`);
    await queryRunner.query(`ALTER TABLE "top_best_diffs" DROP COLUMN IF EXISTS "worker_name";`);
    await queryRunner.query(`ALTER TABLE "top_best_diffs" DROP COLUMN IF EXISTS "user_address";`);
  }
}
