/** @type {import('next').NextConfig} */
// Use `SITE_NAME` (server-side) as the single canonical source for the site name.
// This prefers `SITE_NAME` (server env) and maps it to the client-exposed
// `NEXT_PUBLIC_SITE_NAME` at build time. If `SITE_NAME` is not set, fall back
// to `NEXT_PUBLIC_SITE_NAME` or the default.
const siteName = process.env.SITE_NAME || process.env.NEXT_PUBLIC_SITE_NAME || 'CKstats';

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
  // but fall back to SITE_NAME if present in the environment.
  env: {
    // Expose the canonical `SITE_NAME` value to the client as
    // `NEXT_PUBLIC_SITE_NAME` so browser code can read it safely.
    NEXT_PUBLIC_SITE_NAME: siteName,
    // Map a friendly server-side env var `MEMPOOL_LINK_TAG` into the
    // client-exposed `NEXT_PUBLIC_MEMPOOL_LINK_TAG` so deploys can set the
    // simple name without needing the NEXT_PUBLIC prefix.
    NEXT_PUBLIC_MEMPOOL_LINK_TAG:
      process.env.MEMPOOL_LINK_TAG || process.env.NEXT_PUBLIC_MEMPOOL_LINK_TAG || 'solock',
  },
};

module.exports = nextConfig;
