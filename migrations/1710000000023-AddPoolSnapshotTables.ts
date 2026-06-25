import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Decoupled multi-pool ingestion (write-side staging). Per-pool CAPTURE writes normalized snapshot
 * rows here; the COMBINE job reads the latest rows per pool and writes the existing combined tables
 * (PoolStats/UserStats/Worker/top_best_diffs/online_devices) the UI already reads. These tables are
 * write-side only — never read by the UI — and bounded: capture UPSERTs the latest row per
 * (pool, address[, worker_name]), so they don't grow as a time-series. `fetched_at` drives the
 * staleness TTL and the UI freshness panel.
 *
 * Hashrates are stored as parsed numeric H/s (the unit-string "73.4T" parsing, parseWorkerName
 * identity, and normalizeUserAgent device resolution all happen in the capture step, once per fetch).
 *
 * Also adds a composite (workerId, timestamp) index on WorkerStats so the user page's
 * latest-row-per-worker lookup is one grouped MAX(timestamp) rather than a per-row subquery.
 * Every statement here is idempotent (IF [NOT] EXISTS), so this migration is safe to re-run.
 */
export class AddPoolSnapshotTables1710000000023 implements MigrationInterface {
  name = 'AddPoolSnapshotTables1710000000023';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Per-pool, per-user snapshot (latest only — PK dedups to one row per pool+user).
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "pool_user_snapshot" (
        "pool"        varchar(256) NOT NULL,
        "address"     varchar(256) NOT NULL,
        "hashrate1m"  double precision NOT NULL DEFAULT 0,
        "hashrate5m"  double precision NOT NULL DEFAULT 0,
        "hashrate1hr" double precision NOT NULL DEFAULT 0,
        "hashrate1d"  double precision NOT NULL DEFAULT 0,
        "hashrate7d"  double precision NOT NULL DEFAULT 0,
        "last_share"  bigint NOT NULL DEFAULT 0,
        "authorised"  bigint NOT NULL DEFAULT 0,
        "shares"      double precision NOT NULL DEFAULT 0,
        "best_share"  double precision NOT NULL DEFAULT 0,
        "best_ever"   double precision NOT NULL DEFAULT 0,
        "worker_count" integer NOT NULL DEFAULT 0,
        "fetched_at"  timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY ("pool", "address")
      );
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_pool_user_snapshot_address" ON "pool_user_snapshot" ("address");`
    );

    // Per-pool, per-worker snapshot (latest only — PK = pool + the worker's identity).
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "pool_worker_snapshot" (
        "pool"        varchar(256) NOT NULL,
        "address"     varchar(256) NOT NULL,
        "worker_name" varchar(256) NOT NULL,
        "hashrate1m"  double precision NOT NULL DEFAULT 0,
        "hashrate5m"  double precision NOT NULL DEFAULT 0,
        "hashrate1hr" double precision NOT NULL DEFAULT 0,
        "hashrate1d"  double precision NOT NULL DEFAULT 0,
        "hashrate7d"  double precision NOT NULL DEFAULT 0,
        "last_share"  bigint NOT NULL DEFAULT 0,
        "started"     bigint NOT NULL DEFAULT 0,
        "shares"      double precision NOT NULL DEFAULT 0,
        "best_share"  double precision NOT NULL DEFAULT 0,
        "best_ever"   double precision NOT NULL DEFAULT 0,
        "device"      varchar(256),
        "device_raw"  varchar(512),
        "fetched_at"  timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY ("pool", "address", "worker_name")
      );
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_pool_worker_snapshot_addr" ON "pool_worker_snapshot" ("address", "worker_name");`
    );

    // Per-pool pool.status snapshot (one row per pool — latest).
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "pool_status_snapshot" (
        "pool"            varchar(256) NOT NULL,
        "users"           integer NOT NULL DEFAULT 0,
        "workers"         integer NOT NULL DEFAULT 0,
        "idle"            integer NOT NULL DEFAULT 0,
        "disconnected"    integer NOT NULL DEFAULT 0,
        "hashrate1m"      double precision NOT NULL DEFAULT 0,
        "hashrate5m"      double precision NOT NULL DEFAULT 0,
        "hashrate15m"     double precision NOT NULL DEFAULT 0,
        "hashrate1hr"     double precision NOT NULL DEFAULT 0,
        "hashrate6hr"     double precision NOT NULL DEFAULT 0,
        "hashrate1d"      double precision NOT NULL DEFAULT 0,
        "hashrate7d"      double precision NOT NULL DEFAULT 0,
        "accepted"        double precision NOT NULL DEFAULT 0,
        "rejected"        double precision NOT NULL DEFAULT 0,
        "accepted_count"  bigint NOT NULL DEFAULT 0,
        "rejected_count"  bigint NOT NULL DEFAULT 0,
        "bestshare"       double precision NOT NULL DEFAULT 0,
        "netdiff"         double precision,
        "diff"            double precision NOT NULL DEFAULT 0,
        "sps1m"           double precision NOT NULL DEFAULT 0,
        "sps5m"           double precision NOT NULL DEFAULT 0,
        "sps15m"          double precision NOT NULL DEFAULT 0,
        "sps1h"           double precision NOT NULL DEFAULT 0,
        "runtime"         bigint NOT NULL DEFAULT 0,
        "lastupdate"      bigint NOT NULL DEFAULT 0,
        "user_agents"     jsonb,
        "fetched_at"      timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY ("pool")
      );
    `);

    // Per-pool source health (read by the UI freshness panel — the only UI read of this set).
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "pool_source_status" (
        "pool"         varchar(256) NOT NULL,
        "last_pull_at" timestamptz,
        "state"        varchar(32) NOT NULL DEFAULT 'unknown',
        "users"        integer NOT NULL DEFAULT 0,
        "workers"      integer NOT NULL DEFAULT 0,
        "hashrate5m"   double precision NOT NULL DEFAULT 0,
        "updated_at"   timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY ("pool")
      );
    `);

    // Backs latest-row-per-worker lookups (getUserWithWorkers): with (workerId, timestamp) the
    // join resolves each worker's newest row via a grouped MAX instead of a per-row correlated scan.
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "WorkerStats_workerId_timestamp_idx" ON "WorkerStats" ("workerId", "timestamp");`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "WorkerStats_workerId_timestamp_idx";`
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "pool_source_status";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "pool_status_snapshot";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "pool_worker_snapshot";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "pool_user_snapshot";`);
  }
}
