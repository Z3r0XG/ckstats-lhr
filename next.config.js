const siteName =
  process.env.SITE_NAME || process.env.NEXT_PUBLIC_SITE_NAME || 'CKstats';

const coin =
  (process.env.COIN || process.env.NEXT_PUBLIC_COIN || 'BTC').trim().toUpperCase();

const mempoolLinkTag =
  process.env.MEMPOOL_LINK_TAG ??
  process.env.NEXT_PUBLIC_MEMPOOL_LINK_TAG ??
  'solock';

const defaultDonationAddress =
  coin === 'BCH'
    ? 'qz85msghggld3smflk8flv0yza4c0c5drqgdgeruug'
    : 'bc1q8qkesw5kyplv7hdxyseqls5m78w5tqdfd40lf5';
const donationAddress =
  process.env.DONATION_ADDRESS ||
  process.env.NEXT_PUBLIC_DONATION_ADDRESS ||
  defaultDonationAddress;

const defaultTheme =
  process.env.DEFAULT_THEME ||
  process.env.NEXT_PUBLIC_DEFAULT_THEME ||
  (coin === 'BCH' ? 'dim' : 'dark');

const nextConfig = {
  webpack: (config) => {
    config.externals.push({
      'utf-8-validate': 'commonjs utf-8-validate',
      bufferutil: 'commonjs bufferutil',
    });
    return config;
  },
  experimental: {
    serverComponentsExternalPackages: ['typeorm'],
  },
  env: {
    NEXT_PUBLIC_SITE_NAME: siteName,
    NEXT_PUBLIC_COIN: coin,
    NEXT_PUBLIC_MEMPOOL_LINK_TAG: mempoolLinkTag,
    NEXT_PUBLIC_SHOW_REJECTED_STATS:
      process.env.SHOW_REJECTED_STATS ||
      process.env.NEXT_PUBLIC_SHOW_REJECTED_STATS ||
      'false',
    NEXT_PUBLIC_SHOW_SHARE_COUNTS:
      process.env.SHOW_SHARE_COUNTS ||
      process.env.NEXT_PUBLIC_SHOW_SHARE_COUNTS ||
      'false',
    NEXT_PUBLIC_DONATION_ADDRESS: donationAddress,
    NEXT_PUBLIC_DEFAULT_THEME: defaultTheme,
  },
};

module.exports = nextConfig;
