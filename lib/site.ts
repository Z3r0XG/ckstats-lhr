export const SITE_NAME =
  process.env.SITE_NAME || process.env.NEXT_PUBLIC_SITE_NAME || 'CKstats';

export const SITE_NAME_PUBLIC =
  process.env.NEXT_PUBLIC_SITE_NAME || process.env.SITE_NAME || 'CKstats';

export default SITE_NAME;
