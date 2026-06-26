// Fail fast with a clear message if Node is too old, instead of crashing deep in the build with an
// obscure undici error (undici 8 calls webidl.markAsUncloneable, added in Node 22.19). next.config.js
// is loaded at the very start of both `next build` and `next start`, so this fires before anything
// imports undici. Mirrors the `engines` field in package.json.
{
  const [maj, min] = process.versions.node.split('.').map(Number);
  if (maj < 22 || (maj === 22 && min < 19)) {
    throw new Error(
      `ckstats requires Node >= 22.19.0 (undici 8); current Node is ${process.versions.node}. ` +
        `Install Node 22.19+ and re-run pnpm install.`
    );
  }
}

const siteName =
  process.env.SITE_NAME || process.env.NEXT_PUBLIC_SITE_NAME || 'CKstats';

const coin = (process.env.COIN || process.env.NEXT_PUBLIC_COIN || 'BTC')
  .trim()
  .toUpperCase();

const mempoolLinkTag =
  process.env.MEMPOOL_LINK_TAG ??
  process.env.NEXT_PUBLIC_MEMPOOL_LINK_TAG ??
  'solock';

const defaultDonationAddress =
  coin === 'BCH'
    ? 'qz85msghggld3smflk8flv0yza4c0c5drqgdgeruug'
    : coin === 'DGB'
      ? 'dgb1q6tf0myda7plmpksdqc8k4tf8q957z0fm0y9a5m'
      : coin === 'CHTA'
        ? 'CVXL3EHkrH8xWsv4ECtwWxJqzHQG9KujNq'
        : coin === 'WJK'
          ? 'WYNZktmkqQsJz9YAYRguWHAtWsyaHhzDg9'
          : 'bc1q8qkesw5kyplv7hdxyseqls5m78w5tqdfd40lf5';
const donationAddress =
  process.env.DONATION_ADDRESS ||
  process.env.NEXT_PUBLIC_DONATION_ADDRESS ||
  defaultDonationAddress;

const defaultTheme =
  process.env.DEFAULT_THEME ||
  process.env.NEXT_PUBLIC_DEFAULT_THEME ||
  (coin === 'BCH'
    ? 'dim'
    : coin === 'DGB'
      ? 'cupcake'
      : coin === 'CHTA'
        ? 'autumn'
        : 'dark');

// Stat-display toggles default to SHOWN; the user opts OUT via HIDE_*. The legacy SHOW_* flags
// (already on main) are still honored for backwards compatibility. Precedence: explicit HIDE_* wins,
// then legacy SHOW_*, then default 'true' (show everything). Returns the resolved "should show"
// string the client components read (kept as NEXT_PUBLIC_SHOW_* so their reads are unchanged).
function resolveShow(hide, show) {
  if (hide === 'true') return 'false';
  if (hide === 'false') return 'true';
  if (show === 'true') return 'true';
  if (show === 'false') return 'false';
  return 'true';
}

const showRejectedStats = resolveShow(
  process.env.HIDE_REJECTED_STATS ??
    process.env.NEXT_PUBLIC_HIDE_REJECTED_STATS,
  process.env.SHOW_REJECTED_STATS ?? process.env.NEXT_PUBLIC_SHOW_REJECTED_STATS
);

const showShareCounts = resolveShow(
  process.env.HIDE_SHARE_COUNTS ?? process.env.NEXT_PUBLIC_HIDE_SHARE_COUNTS,
  process.env.SHOW_SHARE_COUNTS ?? process.env.NEXT_PUBLIC_SHOW_SHARE_COUNTS
);

// Content visibility. Operators hide UI elements with per-element flags set to "true", named
// HIDE_<PAGE>_<CARD>_<METRIC>_<SUBTEXT>: a hyphen joins the words of one label, an underscore
// steps down a tier; homepage flags carry no page prefix, user/worker pages use HIDE_USER_ /
// HIDE_WORKER_. Each flag maps to an internal element ID that isVisible() matches by dot-prefix,
// so a parent flag (e.g. HIDE_HASHRATES) hides all of its children. Resolved here into
// NEXT_PUBLIC_HIDDEN (a comma-separated ID list) at build time.
const VISIBILITY_FLAGS = {
  // ── Dashboard: cards ──
  'HIDE_STATS-SERVICE': 'dashboard.stats_service',
  'HIDE_STATS-SERVICE_STREAMS': 'dashboard.stats_service.streams',
  'HIDE_STATS-SERVICE_LAST-UPDATE': 'dashboard.stats_service.lastupdate',
  'HIDE_POOL-SERVICE': 'dashboard.pool_service',
  'HIDE_POOL-SERVICE_UPTIME': 'dashboard.pool_service.uptime',
  'HIDE_POOL-SERVICE_LAST-UPDATE': 'dashboard.pool_service.lastupdate',
  HIDE_CONNECTIONS: 'dashboard.connections',
  HIDE_CONNECTIONS_USERS: 'dashboard.connections.users',
  HIDE_CONNECTIONS_USERS_IDLE: 'dashboard.connections.users.subtext',
  HIDE_CONNECTIONS_WORKERS: 'dashboard.connections.workers',
  HIDE_CONNECTIONS_WORKERS_DISCONNECTED:
    'dashboard.connections.workers.subtext',
  'HIDE_WORK-SUBMITTED': 'dashboard.work',
  'HIDE_WORK-SUBMITTED_EFFORT': 'dashboard.work.effort',
  'HIDE_WORK-SUBMITTED_ACCEPTED': 'dashboard.work.accepted',
  'HIDE_WORK-SUBMITTED_ACCEPTED_PERCENTAGE': 'dashboard.work.accepted.subtext',
  'HIDE_WORK-SUBMITTED_REJECTED': 'dashboard.work.rejected',
  'HIDE_WORK-SUBMITTED_REJECTED_PERCENTAGE': 'dashboard.work.rejected.subtext',
  'HIDE_SHARE-COUNTS': 'dashboard.sharecounts',
  'HIDE_SHARE-COUNTS_TOTAL': 'dashboard.sharecounts.total',
  'HIDE_SHARE-COUNTS_ACCEPTED': 'dashboard.sharecounts.accepted',
  'HIDE_SHARE-COUNTS_ACCEPTED_PERCENTAGE':
    'dashboard.sharecounts.accepted.subtext',
  'HIDE_SHARE-COUNTS_REJECTED': 'dashboard.sharecounts.rejected',
  'HIDE_SHARE-COUNTS_REJECTED_PERCENTAGE':
    'dashboard.sharecounts.rejected.subtext',
  HIDE_DIFFICULTY: 'dashboard.difficulty',
  'HIDE_DIFFICULTY_NET-DIFF': 'dashboard.difficulty.netdiff',
  'HIDE_DIFFICULTY_BEST-DIFF': 'dashboard.difficulty.bestdiff',
  'HIDE_DIFFICULTY_BEST-DIFF_PROXIMITY':
    'dashboard.difficulty.bestdiff.subtext',
  'HIDE_DIFFICULTY_AVG-TIME': 'dashboard.difficulty.avgtime',
  'HIDE_SHARES-PER-SECOND': 'dashboard.sps',
  'HIDE_SHARES-PER-SECOND_1M': 'dashboard.sps.1m',
  'HIDE_SHARES-PER-SECOND_5M': 'dashboard.sps.5m',
  'HIDE_SHARES-PER-SECOND_15M': 'dashboard.sps.15m',
  'HIDE_SHARES-PER-SECOND_1H': 'dashboard.sps.1h',
  HIDE_HASHRATES: 'dashboard.hashrates',
  HIDE_HASHRATES_1M: 'dashboard.hashrates.1m',
  HIDE_HASHRATES_5M: 'dashboard.hashrates.5m',
  HIDE_HASHRATES_15M: 'dashboard.hashrates.15m',
  HIDE_HASHRATES_1HR: 'dashboard.hashrates.1hr',
  HIDE_HASHRATES_6HR: 'dashboard.hashrates.6hr',
  HIDE_HASHRATES_1D: 'dashboard.hashrates.1d',
  HIDE_HASHRATES_7D: 'dashboard.hashrates.7d',
  // ── Dashboard: sections ──
  HIDE_CHART: 'dashboard.chart',
  HIDE_LEADERBOARDS: 'dashboard.leaderboard',
  HIDE_LEADERBOARDS_DIFFICULTIES: 'dashboard.leaderboard.difficulties',
  HIDE_LEADERBOARDS_HASHRATES: 'dashboard.leaderboard.hashrates',
  HIDE_LEADERBOARDS_LOYALTY: 'dashboard.leaderboard.loyalty',
  'HIDE_HIGH-SCORES': 'dashboard.highscores',
  'HIDE_ONLINE-DEVICES': 'dashboard.online_devices',
  // ── User page ──
  HIDE_USER_CONNECTION: 'user.connection',
  HIDE_USER_CONNECTION_WORKERS: 'user.connection.workers',
  HIDE_USER_CONNECTION_WORKERS_TOTAL: 'user.connection.workers.subtext',
  HIDE_USER_CONNECTION_AUTHORISED: 'user.connection.authorised',
  'HIDE_USER_CONNECTION_LAST-SHARE': 'user.connection.lastshare',
  HIDE_USER_DIFFICULTY: 'user.difficulty',
  'HIDE_USER_DIFFICULTY_ACCEPTED-WORK': 'user.difficulty.accepted',
  'HIDE_USER_DIFFICULTY_ACCEPTED-WORK_EFFORT':
    'user.difficulty.accepted.subtext',
  'HIDE_USER_DIFFICULTY_BEST-DIFF': 'user.difficulty.bestdiff',
  'HIDE_USER_DIFFICULTY_BEST-DIFF_PROXIMITY':
    'user.difficulty.bestdiff.subtext',
  'HIDE_USER_DIFFICULTY_BEST-EVER': 'user.difficulty.bestever',
  'HIDE_USER_DIFFICULTY_BEST-EVER_PROXIMITY':
    'user.difficulty.bestever.subtext',
  HIDE_USER_HASHRATES: 'user.hashrates',
  HIDE_USER_HASHRATES_5M: 'user.hashrates.5m',
  HIDE_USER_HASHRATES_5M_CHANGE: 'user.hashrates.5m.subtext',
  HIDE_USER_HASHRATES_1HR: 'user.hashrates.1hr',
  HIDE_USER_HASHRATES_1HR_CHANGE: 'user.hashrates.1hr.subtext',
  HIDE_USER_HASHRATES_1D: 'user.hashrates.1d',
  HIDE_USER_HASHRATES_1D_CHANGE: 'user.hashrates.1d.subtext',
  HIDE_USER_HASHRATES_7D: 'user.hashrates.7d',
  HIDE_USER_HASHRATES_7D_CHANGE: 'user.hashrates.7d.subtext',
  HIDE_USER_ODDS: 'user.odds',
  'HIDE_USER_ODDS_1-DAY': 'user.odds.1d',
  'HIDE_USER_ODDS_1-WEEK': 'user.odds.1w',
  'HIDE_USER_ODDS_1-MONTH': 'user.odds.1m',
  'HIDE_USER_ODDS_1-YEAR': 'user.odds.1y',
  HIDE_USER_CHART: 'user.chart',
  HIDE_USER_WORKERS: 'user.workers',
  // ── Worker page ──
  HIDE_WORKER_CONNECTION: 'worker.connection',
  HIDE_WORKER_CONNECTION_CLIENT: 'worker.connection.client',
  HIDE_WORKER_CONNECTION_UPTIME: 'worker.connection.uptime',
  'HIDE_WORKER_CONNECTION_LAST-SHARE': 'worker.connection.lastshare',
  HIDE_WORKER_DIFFICULTY: 'worker.difficulty',
  'HIDE_WORKER_DIFFICULTY_ACCEPTED-WORK': 'worker.difficulty.accepted',
  'HIDE_WORKER_DIFFICULTY_ACCEPTED-WORK_EFFORT':
    'worker.difficulty.accepted.subtext',
  'HIDE_WORKER_DIFFICULTY_BEST-DIFF': 'worker.difficulty.bestdiff',
  'HIDE_WORKER_DIFFICULTY_BEST-DIFF_PROXIMITY':
    'worker.difficulty.bestdiff.subtext',
  'HIDE_WORKER_DIFFICULTY_BEST-EVER': 'worker.difficulty.bestever',
  'HIDE_WORKER_DIFFICULTY_BEST-EVER_PROXIMITY':
    'worker.difficulty.bestever.subtext',
  HIDE_WORKER_HASHRATES: 'worker.hashrates',
  HIDE_WORKER_HASHRATES_1M: 'worker.hashrates.1m',
  HIDE_WORKER_HASHRATES_1M_CHANGE: 'worker.hashrates.1m.subtext',
  HIDE_WORKER_HASHRATES_5M: 'worker.hashrates.5m',
  HIDE_WORKER_HASHRATES_5M_CHANGE: 'worker.hashrates.5m.subtext',
  HIDE_WORKER_HASHRATES_1HR: 'worker.hashrates.1hr',
  HIDE_WORKER_HASHRATES_1HR_CHANGE: 'worker.hashrates.1hr.subtext',
  HIDE_WORKER_HASHRATES_1D: 'worker.hashrates.1d',
  HIDE_WORKER_HASHRATES_1D_CHANGE: 'worker.hashrates.1d.subtext',
  HIDE_WORKER_HASHRATES_7D: 'worker.hashrates.7d',
  HIDE_WORKER_HASHRATES_7D_CHANGE: 'worker.hashrates.7d.subtext',
  HIDE_WORKER_CHART: 'worker.chart',
  HIDE_WORKER_TABLE: 'worker.table',
  HIDE_WORKER_TABLE_NAME: 'worker.table.name',
  HIDE_WORKER_TABLE_CLIENT: 'worker.table.client',
  HIDE_WORKER_TABLE_HASHRATE: 'worker.table.hashrate',
  'HIDE_WORKER_TABLE_HASHRATE-1HR': 'worker.table.hashrate1hr',
  'HIDE_WORKER_TABLE_HASHRATE-1D': 'worker.table.hashrate1d',
  'HIDE_WORKER_TABLE_ACCEPTED-WORK': 'worker.table.accepted',
  'HIDE_WORKER_TABLE_BEST-DIFF': 'worker.table.bestdiff',
  'HIDE_WORKER_TABLE_BEST-EVER': 'worker.table.bestever',
  'HIDE_WORKER_TABLE_LAST-SHARE': 'worker.table.lastshare',
  HIDE_WORKER_TABLE_UPTIME: 'worker.table.uptime',
};

// Raw HIDE list (comma/space-separated IDs) is the underlying mechanism the flags compile into;
// kept working for completeness though the flags above are the documented interface.
const hiddenIds = (process.env.HIDE || process.env.NEXT_PUBLIC_HIDDEN || '')
  .split(/[,\s]+/)
  .map((s) => s.trim())
  .filter(Boolean);
for (const [flag, id] of Object.entries(VISIBILITY_FLAGS)) {
  if (process.env[flag] === 'true') hiddenIds.push(id);
}
// Legacy single-purpose flags, superseded by the per-element flags but still honored.
if (showRejectedStats === 'false') hiddenIds.push('dashboard.work.rejected');
if (showShareCounts === 'false') hiddenIds.push('dashboard.sharecounts');
const hidden = Array.from(new Set(hiddenIds)).join(',');

const nextConfig = {
  // Build output dir. Defaults to .next. Override with NEXT_DIST_DIR to run a second instance from
  // the same source tree with its own build, so each can be rebuilt/restarted independently
  // without clobbering the other's running .next.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  webpack: (config) => {
    config.externals.push({
      'utf-8-validate': 'commonjs utf-8-validate',
      bufferutil: 'commonjs bufferutil',
    });
    return config;
  },
  experimental: {
    // instrumentationHook: run instrumentation.ts register() on server boot (stable in Next 15;
    // opt-in in 14.2) — that's where the in-process multi-pool ingest loop is started.
    instrumentationHook: true,
    serverComponentsExternalPackages: ['typeorm', 'undici'],
  },
  env: {
    NEXT_PUBLIC_SITE_NAME: siteName,
    NEXT_PUBLIC_COIN: coin,
    NEXT_PUBLIC_MEMPOOL_LINK_TAG: mempoolLinkTag,
    NEXT_PUBLIC_SHOW_REJECTED_STATS: showRejectedStats,
    NEXT_PUBLIC_SHOW_SHARE_COUNTS: showShareCounts,
    NEXT_PUBLIC_HIDDEN: hidden,
    NEXT_PUBLIC_DONATION_ADDRESS: donationAddress,
    NEXT_PUBLIC_DEFAULT_THEME: defaultTheme,
  },
};

module.exports = nextConfig;
