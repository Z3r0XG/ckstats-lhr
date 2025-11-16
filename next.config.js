/** @type {import('next').NextConfig} */
// Use SITE_TITLE as the single canonical source for the site name.
// This intentionally prefers `SITE_TITLE` (server env) and maps it to the
// client-exposed `NEXT_PUBLIC_SITE_NAME` at build time. If `SITE_TITLE` is
// not set, fall back to the default name.
const siteName = process.env.SITE_TITLE || 'CKPool Stats';

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
  // Expose a client-safe SITE_NAME variable. Prefer NEXT_PUBLIC_SITE_NAME,
  // but fall back to SITE_NAME or SITE_TITLE if present in the environment.
  env: {
    NEXT_PUBLIC_SITE_NAME: siteName,
    // Map a friendly server-side env var `MEMPOOL_LINK_TAG` into the
    // client-exposed `NEXT_PUBLIC_MEMPOOL_LINK_TAG` so deploys can set the
    // simple name without needing the NEXT_PUBLIC prefix.
    NEXT_PUBLIC_MEMPOOL_LINK_TAG:
      process.env.MEMPOOL_LINK_TAG || process.env.NEXT_PUBLIC_MEMPOOL_LINK_TAG || 'solock',
  },
};

module.exports = nextConfig;
