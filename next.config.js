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
    NEXT_PUBLIC_DONATION_ADDRESS: donationAddress,
    NEXT_PUBLIC_DEFAULT_THEME: defaultTheme,
  },
};

module.exports = nextConfig;
