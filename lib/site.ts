// Centralized site name helper
// Use `SITE_NAME` (server-side env) as the canonical source, and
// `NEXT_PUBLIC_SITE_NAME` for client-exposed builds. Both fall back
// to 'CKstats' if unset.
export const SITE_NAME =
  process.env.SITE_NAME || process.env.NEXT_PUBLIC_SITE_NAME || 'CKstats';

// Client-safe value: prefer NEXT_PUBLIC_SITE_NAME but fall back to SITE_NAME
// so components that run in the browser can import this value.
export const SITE_NAME_PUBLIC =
  process.env.NEXT_PUBLIC_SITE_NAME || process.env.SITE_NAME || 'CKstats';

export default SITE_NAME;
