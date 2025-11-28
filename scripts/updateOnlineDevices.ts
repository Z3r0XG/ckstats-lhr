import 'dotenv/config';
import 'reflect-metadata';
import { getDb } from '../lib/db';

async function main() {
  // Accept either new or old env var names for backwards compatibility
  const windowMinutes = Number(
    process.env.TOP_ONLINE_DEVICES_WINDOW_MINUTES ?? process.env.TOP_CLIENTS_WINDOW_MINUTES ?? '60'
  );
  const limit = Number(process.env.TOP_ONLINE_DEVICES_LIMIT ?? process.env.TOP_CLIENTS_LIMIT ?? '100');

  if (!Number.isFinite(windowMinutes) || windowMinutes <= 0) {
    throw new Error('Invalid window minutes');
  }

  const db = await getDb();
  try {
    const aggSql = `WITH all_clients AS (
      SELECT DISTINCT COALESCE(NULLIF("userAgent", ''), 'Unknown') AS client
      FROM "Worker"
      WHERE "userAgent" IS NOT NULL AND "userAgent" <> ''
    ), active AS (
      SELECT COALESCE(NULLIF("userAgent", ''), 'Unknown') AS client,
             COUNT(*) AS active_workers,
             SUM(COALESCE(hashrate1hr,0)) AS total_hashrate1hr,
             COALESCE(MAX("bestEver"), 0) AS best_active
      FROM "Worker"
      WHERE "userAgent" IS NOT NULL AND "userAgent" <> ''
        AND "lastUpdate" >= now() - interval '1 minute' * $2
      GROUP BY client
    )
    SELECT c.client,
           COALESCE(a.active_workers, 0) AS active_workers,
           COALESCE(a.total_hashrate1hr, 0) AS total_hashrate1hr,
           COALESCE(a.best_active, 0) AS best_active
    FROM all_clients c
    LEFT JOIN active a USING (client)
          ORDER BY COALESCE(a.total_hashrate1hr, 0) DESC,
            c.client ASC
    LIMIT $1;`;

    const rows: Array<{
      client: string;
      active_workers: string;
      total_hashrate1hr: string;
      best_active: string;
    }> = await db.query(aggSql, [limit, windowMinutes]);

    await db.transaction(async (manager) => {
      let rank = 1;
      for (const r of rows) {
        await manager.query(
            `INSERT INTO "online_devices" (client, active_workers, total_hashrate1hr, best_active, window_minutes, rank, computed_at)
             VALUES ($1, $2, $3, $4, $5, $6, now())
             ON CONFLICT (client, window_minutes) DO UPDATE
             SET active_workers = EXCLUDED.active_workers,
               total_hashrate1hr = EXCLUDED.total_hashrate1hr,
               best_active = EXCLUDED.best_active,
               rank = EXCLUDED.rank,
               computed_at = now();`,
          [
            r.client,
            Number(r.active_workers || 0),
            Number(r.total_hashrate1hr || 0),
            Number(r.best_active || 0),
            windowMinutes,
            rank,
          ]
        );
        rank += 1;
      }
    });

    console.log(
      `Online devices updated: window=${windowMinutes}m, rows=${rows.length}`
    );
  } finally {
    try {
      await db.destroy();
    } catch {
      // ignore
    }
  }
}

main().catch((err) => {
  console.error('updateOnlineDevices failed:', err);
  process.exit(1);
});
