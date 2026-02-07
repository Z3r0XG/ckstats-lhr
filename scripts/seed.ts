// eslint-disable-next-line import/no-unresolved
import 'dotenv/config';
import { readFileStable } from '../utils/readFileStable';

import { getDb } from '../lib/db';
import { PoolStats } from '../lib/entities/PoolStats';
import { convertHashrateFloat, safeParseFloat } from '../utils/helpers';

const DRY_RUN = Boolean(process.env.SEED_DRY_RUN || process.env.DRY_RUN);

interface PoolStatsData {
  runtime: string;
  Users: string;
  Workers: string;
  Idle: string;
  Disconnected: string;
  UserAgents?: Array<{
    ua: string;
    devices: number;
    hashrate5m: string;
    bestshare?: number;
  }>;
  hashrate1m: string;
  hashrate5m: string;
  hashrate15m: string;
  hashrate1hr: string;
  hashrate6hr: string;
  hashrate1d: string;
  hashrate7d: string;
  diff: string;
  diffRaw?: string; // raw token from API, e.g. '0.0' or '0'
  netdiff?: string;
  accepted: string;
  rejected: string;
  bestshare: string;
  SPS1m: string;
  SPS5m: string;
  SPS15m: string;
  SPS1h: string;
}

async function fetchPoolStats(): Promise<Partial<PoolStatsData>> {
  let data: string;
  console.log('Fetching pool stats...');
  const apiUrl =
    (process.env.API_URL || 'https://solo.ckpool.org') + '/pool/pool.status';

  try {
    const response = await fetch(apiUrl);
    data = await response.text();
  } catch (error: any) {
    if (error.cause?.code === 'ERR_INVALID_URL') {
      data = await readFileStable(apiUrl, { retries: 6, backoffMs: 50 });
    } else throw error;
  }

  const jsonLines = data.split('\n').filter(Boolean);
  const parsedData = jsonLines.reduce(
    (acc, line) => ({ ...acc, ...JSON.parse(line) }),
    {}
  );

  // Capture raw diff token string (as it appears in the API response) so we can detect formats like 0.0
  try {
    const diffMatch = data.match(/"diff"\s*:\s*("[^"]*"|[^,}\n]+)/);
    parsedData.diffRaw = diffMatch ? diffMatch[1].trim() : undefined;
  } catch (e) {
    console.warn('Failed to capture raw diff token:', e);
  }

  return parsedData as PoolStatsData;
}

async function updateOnlineDevices(
  db: any,
  userAgents?: Array<{ ua: string; devices: number; hashrate5m: string; bestshare?: number }>
): Promise<void> {
  if (!userAgents || userAgents.length === 0) {
    console.log('No UserAgents data available for online_devices update');
    return;
  }

  console.log(`Updating online_devices with ${userAgents.length} device types...`);

  const sorted = [...userAgents].sort((a, b) => {
    const hashA = convertHashrateFloat((a.hashrate5m ?? '0').trim());
    const hashB = convertHashrateFloat((b.hashrate5m ?? '0').trim());
    return hashB - hashA;
  });

  const updateTimestamp = new Date().toISOString();
  const valuesSql: string[] = [];
  const params: Array<string | number> = [];
  let paramIndex = 1;

  for (let i = 0; i < sorted.length; i++) {
    const device = sorted[i];
    const hashrate5mStr = (device.hashrate5m ?? '0').trim();
    const hashrate5mNum = convertHashrateFloat(hashrate5mStr);
    const bestshareNum = Number(device.bestshare ?? 0);

    valuesSql.push(
      `($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}, $${paramIndex + 4})`
    );

    params.push(
      device.ua,
      device.devices,
      hashrate5mNum,
      updateTimestamp,
      bestshareNum
    );

    paramIndex += 5;
  }

  try {
    await db.transaction(async (manager: any) => {
      await manager.query(
        `INSERT INTO "online_devices" (client, active_workers, total_hashrate, computed_at, bestshare)
         VALUES ${valuesSql.join(', ')}
         ON CONFLICT (client) DO UPDATE SET
           active_workers = EXCLUDED.active_workers,
           total_hashrate = EXCLUDED.total_hashrate,
           computed_at = EXCLUDED.computed_at,
           bestshare = EXCLUDED.bestshare;`,
        params
      );

      await manager.query(
        `DELETE FROM "online_devices" WHERE computed_at < $1;`,
        [updateTimestamp]
      );
    });

    console.log(`Online devices updated: ${userAgents.length} device types`);
  } catch (error) {
    console.error('Error updating online devices:', error);
    throw error;
  }
}

async function clearOnlineDevices(db: any): Promise<void> {
  try {
    await db.query(`DELETE FROM "online_devices";`);
    console.log('Cleared online_devices table (no active users reported)');
  } catch (error) {
    console.error('Error clearing online devices:', error);
    throw error;
  }
}

const TOP_BEST_DIFFS_LIMIT = 10;
const FORCE_REFRESH = process.argv.includes('--force');

async function refreshTopBestDiffsIfNeeded(db: any): Promise<void> {
  try {
    // Check if Worker table exists first
    const tables = await db.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'Worker'
    `);

    if (!tables || tables.length === 0) {
      console.log('Worker table does not exist yet; skipping top_best_diffs refresh');
      return;
    }

    // Check if top_best_diffs table exists
    const topBestDiffsTables = await db.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'top_best_diffs'
    `);

    if (!topBestDiffsTables || topBestDiffsTables.length === 0) {
      console.log('top_best_diffs table does not exist yet; skipping refresh');
      return;
    }

    // Check if table was refreshed in the last hour
    const result = await db.query(
      `SELECT MAX(computed_at) as last_computed FROM "top_best_diffs";`
    );

    const lastComputedAt = result?.[0]?.last_computed;
    const now = new Date();
    const oneHourMs = 3600000;

    // Only refresh if older than 1 hour (or table is empty), or if --force flag is used
    if (
      FORCE_REFRESH ||
      !lastComputedAt ||
      now.getTime() - new Date(lastComputedAt).getTime() > oneHourMs
    ) {
      console.log(
        FORCE_REFRESH
          ? 'Refreshing top_best_diffs (--force flag)...'
          : 'Refreshing top_best_diffs (over 1 hour old)...'
      );

      await db.transaction(async (manager: any) => {
        // Calculate new top N per worker (one row per worker), keep best-ever diff and a timestamp marking when that best was observed.
        const newTop = await manager.query(`
          WITH existing AS (
            SELECT "workerId", difficulty, COALESCE(device, 'Other') AS device, "timestamp"
            FROM "top_best_diffs"
            WHERE "workerId" IS NOT NULL AND "workerId" > 0
          ),
          current AS (
            SELECT 
              w.id AS "workerId",
              w."bestEver" AS difficulty,
              CASE
                WHEN e."workerId" IS NULL THEN COALESCE(w."userAgent", 'Other')    -- new to leaderboard: capture current user agent
                WHEN w."bestEver" > COALESCE(e.difficulty, 0) 
                  AND COALESCE(w."userAgent", 'Other') != COALESCE(e.device, 'Other')
                  THEN COALESCE(w."userAgent", 'Other')                            -- improved with different user agent: update
                ELSE COALESCE(e.device, 'Other')                                   -- no improvement or same user agent: keep original
              END AS device,
              CASE
                WHEN e."workerId" IS NULL THEN now()                                -- new device to leaderboard
                WHEN w."bestEver" > COALESCE(e.difficulty, 0) THEN now()            -- improved best diff
                ELSE e."timestamp"                                                 -- keep original timestamp
              END AS "timestamp"
            FROM "Worker" w
            LEFT JOIN existing e ON e."workerId" = w.id
            WHERE w."bestEver" > 0
          ),
          topN AS (
            SELECT 
              ROW_NUMBER() OVER (ORDER BY difficulty DESC) as rank,
              "workerId",
              difficulty,
              device,
              "timestamp"
            FROM current
            WHERE "workerId" IS NOT NULL
            ORDER BY difficulty DESC
            LIMIT ${TOP_BEST_DIFFS_LIMIT}
          )
          SELECT rank, "workerId", difficulty, device, "timestamp" FROM topN;
        `);

        const touchTime = new Date();

        // Replace table contents atomically (preserving first-seen timestamp from the CTE)
        await manager.query(`DELETE FROM "top_best_diffs";`);

        if (newTop.length > 0) {
          const placeholders = newTop
            .map((_, i) => `($${i * 6 + 1}, $${i * 6 + 2}, $${i * 6 + 3}, $${i * 6 + 4}, $${i * 6 + 5}, $${i * 6 + 6})`)
            .join(', ');
          const params: Array<string | number | Date | null> = [];
          newTop.forEach((row: any) => {
            params.push(Number(row.rank) || 0);
            params.push(Number(row.difficulty) || 0);
            params.push(row.device || 'Other');
            params.push(new Date(row.timestamp)); // first-seen or improvement time
            params.push(touchTime); // computed_at for this refresh
            params.push(row.workerId === null || row.workerId === undefined ? null : Number(row.workerId));
          });

          await manager.query(
            `INSERT INTO "top_best_diffs" (rank, difficulty, device, "timestamp", computed_at, "workerId")
             VALUES ${placeholders};`,
            params
          );
        }
      });

      console.log('Top best diffs refreshed successfully');
    }
  } catch (error) {
    console.error('Error refreshing top best diffs:', error);
    throw error;
  }
}

async function seed() {
  let db: any | null = null;
  try {
    console.log('Fetching pool stats...');
    const stats = await fetchPoolStats();

    const poolStats = {
      runtime: parseInt(stats.runtime ?? '0'),
      users: parseInt(stats.Users ?? '0'),
      workers: parseInt(stats.Workers ?? '0'),
      idle: parseInt(stats.Idle ?? '0'),
      disconnected: stats.Disconnected ? parseInt(stats.Disconnected) : 0,
      hashrate1m: convertHashrateFloat(stats.hashrate1m ?? ''),
      hashrate5m: convertHashrateFloat(stats.hashrate5m ?? ''),
      hashrate15m: convertHashrateFloat(stats.hashrate15m ?? ''),
      hashrate1hr: convertHashrateFloat(stats.hashrate1hr ?? ''),
      hashrate6hr: convertHashrateFloat(stats.hashrate6hr ?? ''),
      hashrate1d: convertHashrateFloat(stats.hashrate1d ?? ''),
      hashrate7d: convertHashrateFloat(stats.hashrate7d ?? ''),
      // If the raw token contains a decimal (e.g. '0.0', '0.00'), treat as tiny but non-zero for formatting.
      diff: (() => {
        const raw = (stats as any).diffRaw ? (stats as any).diffRaw.replace(/"/g, '') : undefined;
        const parsed = safeParseFloat(stats.diff, 0);
        const zeroLikeDecimal = raw && /^0+(?:\.0+)$/.test(raw);
        return zeroLikeDecimal ? 0.0001 : parsed;
      })(),
      netdiff: stats.netdiff ? safeParseFloat(stats.netdiff, 0) : undefined,
      accepted: Number(stats.accepted || 0),
      rejected: Number(stats.rejected || 0),
      bestshare: safeParseFloat(stats.bestshare ?? '', 0),
      SPS1m: stats.SPS1m,
      SPS5m: stats.SPS5m,
      SPS15m: stats.SPS15m,
      SPS1h: stats.SPS1h,
      timestamp: new Date(),
    } as unknown as Partial<PoolStats>;

    if (DRY_RUN) {
      console.log(
        'DRY_RUN enabled — would save the following PoolStats object:'
      );
      console.log(JSON.stringify(poolStats, null, 2));
      return;
    }

    console.log('Saving pool stats to database...');
    db = await getDb();
    const poolStatsRepository = db.getRepository(PoolStats);
    const entity = poolStatsRepository.create(poolStats as Partial<PoolStats>);
    await poolStatsRepository.save(entity);
    console.log('Database seeded successfully');

    const userCount = poolStats.users || 0;

    if (stats.UserAgents && stats.UserAgents.length > 0) {
      await updateOnlineDevices(db, stats.UserAgents);
    } else if (userCount === 0) {
      console.log('No active users in pool status; clearing online_devices');
      await clearOnlineDevices(db);
    } else {
      console.warn(
        'UserAgents missing but pool status reports active users; keeping existing online_devices (stale)'
      );
    }

    // Refresh top_best_diffs if older than 1 hour
    await refreshTopBestDiffsIfNeeded(db);
  } catch (error) {
    console.error('Error seeding database:', error);
  } finally {
    if (db) {
      await db.destroy();
    }
  }
}

(async () => {
  try {
    await seed();
    console.log('Seeding completed successfully.');
  } catch (error) {
    console.error('Error during seeding:', error);
    process.exit(1);
  }
})();
