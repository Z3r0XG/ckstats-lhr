import 'dotenv/config';
import 'reflect-metadata';
import { getDb } from '../lib/db';

async function main() {
  const windowMinutes = Number(process.env.TOP_CLIENTS_WINDOW_MINUTES || '60');
  const limit = Number(process.env.TOP_CLIENTS_LIMIT || '100');

  if (!Number.isFinite(windowMinutes) || windowMinutes <= 0) {
    throw new Error('Invalid window minutes');
  }

  const db = await getDb();
  try {
    // Compute aggregates: active metrics based on recent lastUpdate, historical best_ever (not limited)
    const aggSql = `WITH all_clients AS (
      SELECT DISTINCT COALESCE(NULLIF("userAgent", ''), 'Unknown') AS client
      FROM "Worker"
      WHERE "userAgent" IS NOT NULL AND "userAgent" <> ''
    ), active AS (
      SELECT COALESCE(NULLIF("userAgent", ''), 'Unknown') AS client,
             COUNT(*) AS active_workers,
             SUM(COALESCE(hashrate1hr,0)) AS total_hashrate1hr
      FROM "Worker"
      WHERE "userAgent" IS NOT NULL AND "userAgent" <> ''
        AND "lastUpdate" >= now() - interval '${windowMinutes} minutes'
      GROUP BY client
    ), hist_best AS (
      SELECT COALESCE(NULLIF("userAgent", ''), 'Unknown') AS client,
             COALESCE(MAX("bestEver"), 0) AS best_ever
      FROM "Worker"
      WHERE "userAgent" IS NOT NULL AND "userAgent" <> ''
      GROUP BY client
    )
    SELECT c.client,
           COALESCE(a.active_workers, 0) AS active_workers,
           COALESCE(a.total_hashrate1hr, 0) AS total_hashrate1hr,
           COALESCE(h.best_ever, 0) AS best_ever
    FROM all_clients c
    LEFT JOIN active a USING (client)
    LEFT JOIN hist_best h USING (client)
          ORDER BY COALESCE(a.total_hashrate1hr, 0) DESC,
            c.client ASC
    LIMIT $1;`;

    const rows: Array<{
      client: string;
      active_workers: string;
      total_hashrate1hr: string;
      best_ever: string;
    }> = await db.query(aggSql, [limit]);

    // Upsert strategy: insert or update. Preserve the historical best_ever by taking the greatest
    // of the existing stored value and the newly computed value.
    await db.transaction(async (manager) => {
      let rank = 1;
      for (const r of rows) {
        await manager.query(
          `INSERT INTO "top_clients" (client, active_workers, total_hashrate1hr, best_ever, window_minutes, rank, computed_at)
           VALUES ($1, $2, $3, $4, $5, $6, now())
           ON CONFLICT (client, window_minutes) DO UPDATE
           SET active_workers = EXCLUDED.active_workers,
               total_hashrate1hr = EXCLUDED.total_hashrate1hr,
               best_ever = GREATEST("top_clients".best_ever, EXCLUDED.best_ever),
               rank = EXCLUDED.rank,
               computed_at = now();`,
          [
            r.client,
            Number(r.active_workers || 0),
            Number(r.total_hashrate1hr || 0),
            Number(r.best_ever || 0),
            windowMinutes,
            rank,
          ]
        );
        rank += 1;
      }

      // If there are clients that were previously present in the table for this window but are no longer
      // present in the current computed set, we should ensure they remain listed (historical clients).
      // The above upsert updates or inserts the computed clients; to keep previously-known clients that
      // weren't in the computed `rows` set we do nothing here — they remain with their prior values.
    });

    console.log(
      `Top clients updated: window=${windowMinutes}m, rows=${rows.length}`
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
  console.error('updateTopClients failed:', err);
  process.exit(1);
});
