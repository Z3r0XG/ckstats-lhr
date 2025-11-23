export interface ISOUnit {
  threshold: number;
  iso: string;
}

// An array of all ISO units we support for formatting large numbers.
// Make sure you check for 0 if you use this.
const isoUnits: ISOUnit[] = [
  { threshold: 1e21, iso: 'Z' },
  { threshold: 1e18, iso: 'E' },
  { threshold: 1e15, iso: 'P' },
  { threshold: 1e12, iso: 'T' },
  { threshold: 1e9, iso: 'G' },
  { threshold: 1e6, iso: 'M' },
  { threshold: 1e3, iso: 'k' },
] as const;

// Map of unit suffix (case-sensitive) to multiplier.
// We intentionally include common variants (uppercase/lowercase and ascii 'u' for micro).
const unitMultipliers: { [unit: string]: number } = {
  Z: 1e21,
  E: 1e18,
  P: 1e15,
  T: 1e12,
  G: 1e9,
  M: 1e6,
  k: 1e3,
  K: 1e3,
  m: 1e-3, // milli
  u: 1e-6, // micro (ascii 'u')
  'µ': 1e-6, // micro (unicode mu)
};

export function formatNumber(num: number | bigint | string): string {
  const absNum = Math.abs(Number(num));

  for (const unit of isoUnits) {
    if (absNum >= unit.threshold) {
      return (Number(num) / unit.threshold).toFixed(2) + ' ' + unit.iso;
    }
  }

  return num.toLocaleString();
}

export function formatHashrate(num: string | bigint | number, showLessThanOne: boolean = false): string {
  const numberValue = Number(num);
  const absNum = Math.abs(numberValue);

  // Optional debug logging to diagnose formatting issues in production/test builds.
  // Set the environment variable DEBUG_HASHRATE_FORMAT=1 when you need logs.
  try {
    if (process && process.env && process.env.DEBUG_HASHRATE_FORMAT === '1') {
      console.log('[formatHashrate] input:', num, 'parsed:', numberValue, 'showLessThanOne:', showLessThanOne);
    }
  } catch (e) {
    // ignore in environments without console
  }

  for (const unit of isoUnits) {
    if (absNum >= unit.threshold) {
      return (numberValue / unit.threshold).toLocaleString(undefined, { maximumFractionDigits: 2 }) + ' ' + unit.iso + 'H/s';
    }
  }

  // Exact zero should display as "0 H/s". If the value is positive but
  // less than 1 and the caller requested the "<1" treatment, show "<1 H/s".
  // Handle non-finite or NaN inputs gracefully
  if (!Number.isFinite(numberValue)) {
    return '0 H/s';
  }

  if (numberValue === 0) {
    const out = '0 H/s';
    if (process && process.env && process.env.DEBUG_HASHRATE_FORMAT === '1') console.log('[formatHashrate] ->', out);
    return out;
  }

  if (absNum < 1 && showLessThanOne) {
    const out = '<1 H/s';
    if (process && process.env && process.env.DEBUG_HASHRATE_FORMAT === '1') console.log('[formatHashrate] ->', out);
    return out;
  }

  const out = numberValue.toLocaleString(undefined, { maximumFractionDigits: 2 }) + ' H/s';
  if (process && process.env && process.env.DEBUG_HASHRATE_FORMAT === '1') console.log('[formatHashrate] ->', out);
  return out;
}

export function convertHashrate(value: string): bigint {
  if (!value) return BigInt(0);

  // Match unit-suffixed values like "1.5M", "2k", "370u" (supports signed, decimal and scientific notation)
  const match = value.match(/^([+-]?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)([ZEPTGMKkmuµ])$/);
  if (match) {
    const [, num, unit] = match;
    const parsedNum = Number(num);
    const factor = unitMultipliers[unit] ?? unitMultipliers[unit.toUpperCase()] ?? unitMultipliers[unit.toLowerCase()] ?? (isoUnits.find((u) => u.iso.toUpperCase() === unit.toUpperCase())?.threshold ?? 1);
    const val = parsedNum * factor;
    if (val < 1) return BigInt(0);
    return BigInt(Math.round(val));
  }

  // If it's a plain integer string (no dot, no exponent), use BigInt to preserve very large values
  if (/^[+-]?\d+$/.test(value.trim())) {
    try {
      return BigInt(value);
    } catch (_err) {
      return BigInt(0);
    }
  }

  // Fallback: parse as a decimal/scientific number (e.g., "0.5", "1e3"); apply floor/rounding rules
  const parsed = Number(value);
  if (Number.isNaN(parsed)) return BigInt(0);
  if (parsed < 1) return BigInt(0);
  const rounded = Math.round(parsed);
  // safety: ensure we never return a negative bigint
  if (rounded <= 0) return BigInt(0);
  return BigInt(rounded);
};

// Preserve fractional hashrate as a floating number (H/s). Returns a number.
export function convertHashrateFloat(value: string): number {
  if (!value) return 0;

  // Match unit-suffixed values like "1.5M", "2k", "370u"
  // Accept an optional sign, integer or decimal, and optional exponent (e or E with optional sign)
  const match = value.match(/^([+-]?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)([ZEPTGMKkmuµ])$/);
  if (match) {
    const [, num, unit] = match;
    const parsedNum = Number(num);
    const factor = unitMultipliers[unit] ?? unitMultipliers[unit.toUpperCase()] ?? unitMultipliers[unit.toLowerCase()] ?? (isoUnits.find((u) => u.iso.toUpperCase() === unit.toUpperCase())?.threshold ?? 1);
    const val = parsedNum * factor;
    return Number(val);
  }

  const parsed = Number(value);
  if (Number.isNaN(parsed)) return 0;
  return parsed;
}

export function findISOUnit(num: number): ISOUnit {
  const absNum = Math.abs(num);

  for (const unit of isoUnits) {
    if (absNum >= unit.threshold) {
      return(unit);
    }
  }

  return {threshold: 1, iso: ''};
}

export function formatTimeAgo(date: Date | number | string, minDiff: number = 1): string {
  const now = new Date();
  const lastUpdate = new Date(date);
  const diffMs = now.getTime() - lastUpdate.getTime();
  const diffMinutes = Math.floor(diffMs / 60000);
  
  if (diffMinutes < minDiff) {
    return "Recently";
  } else if (diffMinutes < 60) {
    return `${diffMinutes} min${diffMinutes > 1 ? 's' : ''} ago`;
  } else if (diffMinutes < 1440) { // Less than 24 hours
    const hours = Math.floor(diffMinutes / 60);
    const minutes = diffMinutes % 60;
    return `${hours} hour${hours > 1 ? 's' : ''} ${minutes} min${minutes > 1 ? 's' : ''} ago`;
  } else {
    const days = Math.floor(diffMinutes / 1440);
    const hours = Math.floor((diffMinutes % 1440) / 60);
    const minutes = diffMinutes % 60;
    return `${days} day${days > 1 ? 's' : ''} ${hours} hour${hours > 1 ? 's' : ''} ${minutes} min${minutes > 1 ? 's' : ''} ago`;
  }
}

export function formatDuration(seconds: number): string {
  if (seconds > 8000000000000) {
    return '~∞';
  }

  const years = Math.floor(seconds / 31536000); // 365 days in a year
  const days = Math.floor((seconds % 31536000) / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  const parts: string[] = [];
  if (years > 0) parts.push(`${years}y`);
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0 && years === 0) parts.push(`${minutes}m`);

  return parts.length > 0 ? parts.join(' ') : '0m';
}

export function calculatePercentageChange(currentValue: number, pastValue: number): number | 'N/A' {
  if (pastValue === 0) return 'N/A';

  const percentageChange = ((currentValue - pastValue) / pastValue) * 100;
  return Number(percentageChange.toFixed(2));
}

/**
 * Select the nth-most-recent historical sample (default 120 -> index 119)
 * and compute a percentage change between `stats[key]` and that sample.
 * Returns the same result types as `calculatePercentageChange` and applies
 * the same guards (returns 'N/A' when insufficient samples or past value is 0).
 */
export function getHistoricalPercentageChange(
  stats: any,
  historical: any[] | null | undefined,
  key: string,
  requiredSamples: number = 120
): number | 'N/A' {
  if (!historical || historical.length < requiredSamples) return 'N/A';

  const index = requiredSamples - 1; // 120th-most-recent sample -> index 119
  const pastEntry = historical[index];
  if (!pastEntry) return 'N/A';

  const pastValue = Number(pastEntry[key]);
  return calculatePercentageChange(Number(stats[key]), pastValue);
}

export function getPercentageChangeColor(change: number | 'N/A'): string {
  if (change === 'N/A') return 'text-base-content';
  return change > 0 ? 'text-success' : change < 0 ? 'text-error' : 'text-base-content';
}

// Difficulty is assumed to be in T, hashrate in H/s
export function calculateAverageTimeToBlock(hashRate: number | bigint, difficulty: number | bigint, units?: string): number {
  // Accept number or bigint for hashRate. Convert to number safely for double-precision calculations.
  const hashesPerDifficulty = Math.pow(2, 32);
  let diffNum: number;
  if (typeof difficulty === 'bigint') {
    // difficulty stored as bigint: convert to number (may lose precision for astronomic values)
    diffNum = Number(difficulty);
  } else {
    if (units === 'T') {
      diffNum = Number(difficulty) * 1e12;
    } else {
      diffNum = Number(difficulty);
    }
  }

  const hr = typeof hashRate === 'bigint' ? Number(hashRate) : hashRate;
  if (!Number.isFinite(hr) || hr === 0 || !Number.isFinite(diffNum) || diffNum === 0) return Infinity;

  // expected seconds = difficulty * 2^32 / hashRate
  return (diffNum * hashesPerDifficulty) / hr;
}

// Difficulty is assumed to be a % of network, hashrate in H/s
export function calculateBlockChances(hashRate: number | bigint, difficulty: number, accepted: bigint): { [key: string]: string } {
  // Convert accepted and difficulty into a probability per hash. This function prefers number math
  // because we use fractional hashrates. For very large integers, precision might be limited.
  const acceptedNum = Number(accepted);
  const networkDiff = Number(difficulty);
  if (!Number.isFinite(acceptedNum) || !Number.isFinite(networkDiff) || networkDiff === 0) {
    return {
      '1h': '<0.001%',
      '1d': '<0.001%',
      '1w': '<0.001%',
      '1m': '<0.001%',
      '1y': '<0.001%',
    };
  }

  // Estimate probability per hash. Note: original code used a derived network difficulty from accepted and difficulty.
  // We approximate similarly but remain in floating arithmetic.
  const hashesPerDifficulty = Math.pow(2, 32);
  const networkFactor = (acceptedNum / (networkDiff * 100));
  const probabilityPerHash = 1 / (networkFactor * hashesPerDifficulty);

  const hashesPerSecond = typeof hashRate === 'bigint' ? Number(hashRate) : hashRate;
  if (!Number.isFinite(hashesPerSecond) || hashesPerSecond <= 0) {
    return {
      '1h': '<0.001%',
      '1d': '<0.001%',
      '1w': '<0.001%',
      '1m': '<0.001%',
      '1y': '<0.001%',
    };
  }

  const periodsInSeconds = {
    '1h': 3600,
    '1d': 86400,
    '1w': 604800,
    '1m': 2592000, // 30 days
    '1y': 31536000, // 365 days
  };

  return Object.entries(periodsInSeconds).reduce((chances, [period, seconds]) => {
    const lambda = hashesPerSecond * seconds * probabilityPerHash;
    const probability = 1 - Math.exp(-lambda);
    // Use a smaller threshold for very small probabilities so UX can show
    // a more granular "<0.0001%" instead of the previous "<0.001%".
    const pct = probability * 100;
    if (pct > 0.0001) {
      // For tiny but non-negligible probabilities, show more precision
      // (up to 6 decimal places). For larger percentages the fixed 3
      // decimal display is sufficient for readability.
      chances[period] = pct < 0.1 ? `${pct.toFixed(6)}%` : `${pct.toFixed(3)}%`;
    } else {
      chances[period] = `<0.0001%`;
    }
    return chances;
  }, {} as { [key: string]: string });
}

export function serializeData(data: any) {
  return JSON.parse(
    JSON.stringify(data, (key, value) =>
      typeof value === 'bigint' ? value.toString() : value
    )
  );
}
