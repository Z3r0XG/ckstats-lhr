const siteName =
  process.env.SITE_NAME || process.env.NEXT_PUBLIC_SITE_NAME || 'CKstats';

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
    NEXT_PUBLIC_MEMPOOL_LINK_TAG:
      process.env.MEMPOOL_LINK_TAG ||
      process.env.NEXT_PUBLIC_MEMPOOL_LINK_TAG ||
      'solock',
    NEXT_PUBLIC_SHOW_REJECTED_STAT:
      process.env.SHOW_REJECTED_STAT ||
      process.env.NEXT_PUBLIC_SHOW_REJECTED_STAT ||
      'false',
  },
};

module.exports = nextConfig;
