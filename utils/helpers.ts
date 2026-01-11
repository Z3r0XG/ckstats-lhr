export interface ISOUnit {
  threshold: number;
  iso: string;
}

const isoUnits: ISOUnit[] = [
  { threshold: 1e21, iso: 'Z' },
  { threshold: 1e18, iso: 'E' },
  { threshold: 1e15, iso: 'P' },
  { threshold: 1e12, iso: 'T' },
  { threshold: 1e9, iso: 'G' },
  { threshold: 1e6, iso: 'M' },
  { threshold: 1e3, iso: 'k' },
] as const;

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
  µ: 1e-6, // micro (unicode mu)
};

export function formatNumber(num: number | bigint | string): string {
  // Handle BigInt-like digit-only strings without converting to Number (avoids precision loss)
  if (typeof num === 'string' && /^[+-]?\d+$/.test(num)) {
    const sign = num.startsWith('-') ? '-' : '';
    const digits = num.replace(/[^\d]/g, '');
    // If number length is within safe Number range (< 16 digits), convert to Number and use unit formatting
    if (digits.length <= 15) {
      const numberVal = Number(num);
      const absNum = Math.abs(numberVal);
      for (const unit of isoUnits) {
        if (absNum >= unit.threshold) {
          return (numberVal / unit.threshold).toFixed(2) + ' ' + unit.iso;
        }
      }
      return sign + numberVal.toLocaleString();
    }
    // For extremely large digit-only strings, group digits without converting to Number to avoid precision loss
    const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return sign + grouped;
  }

  const numberVal = Number(num);
  const absNum = Math.abs(numberVal);

  for (const unit of isoUnits) {
    if (absNum >= unit.threshold) {
      return (numberVal / unit.threshold).toFixed(2) + ' ' + unit.iso;
    }
  }

  if (typeof num === 'bigint') return num.toString();
  return numberVal.toLocaleString();
}

export function formatHashrate(
  num: string | bigint | number,
  showLessThanOne: boolean = false
): string {
  const numberValue = Number(num);
  const absNum = Math.abs(numberValue);

  for (const unit of isoUnits) {
    if (absNum >= unit.threshold) {
      return (
        (numberValue / unit.threshold).toLocaleString(undefined, {
          maximumFractionDigits: 2,
        }) +
        ' ' +
        unit.iso +
        'H/s'
      );
    }
  }

  if (!Number.isFinite(numberValue)) {
    return '0 H/s';
  }

  if (numberValue === 0) {
    return '0 H/s';
  }

  if (absNum < 1 && showLessThanOne) {
    return '<1 H/s';
  }

  return (
    numberValue.toLocaleString(undefined, { maximumFractionDigits: 2 }) + ' H/s'
  );
}

export function convertHashrate(value: string): bigint {
  if (!value) return BigInt(0);

  const match = value.match(
    /^([+-]?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)([ZEPTGMKkmuµ])$/
  );
  if (match) {
    const [, num, unit] = match;
    const parsedNum = Number(num);
    const factor =
      unitMultipliers[unit] ??
      unitMultipliers[unit.toUpperCase()] ??
      unitMultipliers[unit.toLowerCase()] ??
      isoUnits.find((u) => u.iso.toUpperCase() === unit.toUpperCase())
        ?.threshold ??
      1;
    const val = parsedNum * factor;
    if (val < 1) return BigInt(0);
    return BigInt(Math.round(val));
  }

  if (/^[+-]?\d+$/.test(value.trim())) {
    try {
      return BigInt(value);
    } catch {
      return BigInt(0);
    }
  }

  const parsed = Number(value);
  if (Number.isNaN(parsed)) return BigInt(0);
  if (parsed < 1) return BigInt(0);
  const rounded = Math.round(parsed);
  if (rounded <= 0) return BigInt(0);
  return BigInt(rounded);
}

export function convertHashrateFloat(value: string): number {
  if (!value) return 0;

  const match = value.match(
    /^([+-]?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)([ZEPTGMKkmuµ])$/
  );
  if (match) {
    const [, num, unit] = match;
    const parsedNum = Number(num);
    const factor =
      unitMultipliers[unit] ??
      unitMultipliers[unit.toUpperCase()] ??
      unitMultipliers[unit.toLowerCase()] ??
      isoUnits.find((u) => u.iso.toUpperCase() === unit.toUpperCase())
        ?.threshold ??
      1;
    const val = parsedNum * factor;
    return Number(val);
  }

  const parsed = Number(value);
  if (Number.isNaN(parsed)) return 0;
  return parsed;
}

export function normalizeWorkerUserAgent(raw?: string | null): string {
  if (raw === null || raw === undefined) return '';
  return String(raw).trim();
}

export function getWorkerUserAgentDisplay(raw?: string | null): string {
  if (raw === null || raw === undefined) return 'N/A';
  const trimmed = String(raw).trim();
  return trimmed === '' ? 'N/A' : String(raw);
}

export function compareWorkerUserAgentStrings(
  a?: string | null,
  b?: string | null
): number {
  const normA = normalizeWorkerUserAgent(a);
  const normB = normalizeWorkerUserAgent(b);
  if (normA === normB) return 0;
  return normA < normB ? -1 : 1;
}

export function findISOUnit(num: number): ISOUnit {
  const absNum = Math.abs(num);

  for (const unit of isoUnits) {
    if (absNum >= unit.threshold) {
      return unit;
    }
  }

  return { threshold: 1, iso: '' };
}

export function formatTimeAgo(
  date: Date | number | string,
  minDiff: number = 1
): string {
  const now = new Date();
  const lastUpdate = new Date(date);
  const diffMs = now.getTime() - lastUpdate.getTime();
  const diffMinutes = Math.floor(diffMs / 60000);

  if (diffMinutes < minDiff) {
    return 'Recently';
  } else if (diffMinutes < 60) {
    return `${diffMinutes} min${diffMinutes > 1 ? 's' : ''} ago`;
  } else if (diffMinutes < 1440) {
    // Less than 24 hours
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

export function formatConciseTimeAgo(
  date: Date | number | string
): string {
  const target = new Date(date);
  const diffMs = Date.now() - target.getTime();
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const week = 7 * day;
  const month = 30 * day;
  const year = 365 * day;

  const formatUnit = (value: number, unit: string) => {
    const fixed = Number(value.toFixed(1));
    const formatted = Number.isInteger(fixed) ? fixed.toFixed(0) : fixed.toFixed(1);
    return `${formatted} ${unit}${fixed !== 1 ? 's' : ''} ago`;
  };

  if (diffMs < minute) return 'Recently';
  if (diffMs >= year) return formatUnit(diffMs / year, 'year');
  if (diffMs >= month) return formatUnit(diffMs / month, 'month');
  if (diffMs >= week) return formatUnit(diffMs / week, 'week');
  if (diffMs >= day) return formatUnit(diffMs / day, 'day');
  if (diffMs >= hour) return formatUnit(diffMs / hour, 'hour');
  return formatUnit(diffMs / minute, 'min');
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

export function calculatePercentageChange(
  currentValue: number,
  pastValue: number
): number | 'N/A' {
  if (pastValue === 0) return 'N/A';

  const percentageChange = ((currentValue - pastValue) / pastValue) * 100;
  return Number(percentageChange.toFixed(2));
}

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
  return change > 0
    ? 'text-success'
    : change < 0
      ? 'text-error'
      : 'text-base-content';
}

export function calculateAverageTimeToBlock(
  hashRate: number | bigint,
  difficulty: number | bigint,
  units?: string
): number {
  const hashesPerDifficulty = Math.pow(2, 32);
  let diffNum: number;
  if (typeof difficulty === 'bigint') {
    diffNum = Number(difficulty);
  } else {
    if (units === 'T') {
      diffNum = Number(difficulty) * 1e12;
    } else {
      diffNum = Number(difficulty);
    }
  }

  const hr = typeof hashRate === 'bigint' ? Number(hashRate) : hashRate;
  if (
    !Number.isFinite(hr) ||
    hr === 0 ||
    !Number.isFinite(diffNum) ||
    diffNum === 0
  )
    return Infinity;

  return (diffNum * hashesPerDifficulty) / hr;
}

export function calculateBlockChances(
  hashRate: number | bigint,
  difficulty: number,
  accepted: bigint
): { [key: string]: string } {
  const acceptedNum = Number(accepted);
  const networkDiff = Number(difficulty);
  if (
    !Number.isFinite(acceptedNum) ||
    !Number.isFinite(networkDiff) ||
    networkDiff === 0
  ) {
    return {
      '1h': '<0.001%',
      '1d': '<0.001%',
      '1w': '<0.001%',
      '1m': '<0.001%',
      '1y': '<0.001%',
    };
  }

  const hashesPerDifficulty = Math.pow(2, 32);
  const networkFactor = acceptedNum / (networkDiff * 100);
  const probabilityPerHash = 1 / (networkFactor * hashesPerDifficulty);

  const hashesPerSecond =
    typeof hashRate === 'bigint' ? Number(hashRate) : hashRate;
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

  return Object.entries(periodsInSeconds).reduce(
    (chances, [period, seconds]) => {
      const lambda = hashesPerSecond * seconds * probabilityPerHash;
      const probability = 1 - Math.exp(-lambda);
      const pct = probability * 100;
      if (pct > 0.0001) {
        chances[period] =
          pct < 0.1 ? `${pct.toFixed(6)}%` : `${pct.toFixed(3)}%`;
      } else {
        chances[period] = `<0.0001%`;
      }
      return chances;
    },
    {} as { [key: string]: string }
  );
}

export function serializeData(data: any) {
  return JSON.parse(
    JSON.stringify(data, (key, value) =>
      typeof value === 'bigint' ? value.toString() : value
    )
  );
}

export type RejectedPercentResult = {
  pct: number | null; // percent as a number (e.g. 0.75) or null when not applicable
  formatted: string | null; // formatted string like '0.75%' or null for N/A
  color: string; // css class for color mapping
};

export function computeRejectedPercent(
  accepted: number | bigint | string | undefined,
  rejected: number | bigint | string | undefined
): RejectedPercentResult {
  function toBigIntSafe(v: any): bigint {
    if (typeof v === 'bigint') return v;
    if (typeof v === 'number') return BigInt(Math.round(v));
    if (typeof v === 'string') {
      const s = v.trim();
      if (s === '') return BigInt(0);
      if (/^[+-]?\d+$/.test(s)) {
        try {
          return BigInt(s);
        } catch {
          return BigInt(Number(s) || 0);
        }
      }
      const parsed = Number(s);
      if (Number.isNaN(parsed)) return BigInt(0);
      return BigInt(Math.round(parsed));
    }
    return BigInt(0);
  }

  const a = toBigIntSafe(accepted ?? 0);
  const r = toBigIntSafe(rejected ?? 0);
  const total = a + r;

  if (total === BigInt(0)) {
    return { pct: null, formatted: null, color: 'text-base-content' };
  }

  // compute hundredths of percent as integer: pct * 100 -> e.g. 0.75% => 75
  // We'll compute (rejected * 10000) / total to get hundredths (i.e., 0.75% -> 75)
  // Round to nearest hundredth. Using integer math to avoid precision loss:
  // hundredths = round((r * 10000) / total)
  const hundredths = Number((r * BigInt(10000) + total / BigInt(2)) / total); // value in [0..10000]
  const pct = hundredths / 100;

  let color = 'text-base-content';
  if (hundredths <= 50) {
    color = 'text-success';
  } else if (hundredths <= 100) {
    color = 'text-warning';
  } else {
    color = 'text-error';
  }

  return {
    pct,
    formatted: `${(hundredths / 100).toFixed(2)}%`,
    color,
  };
}

export function normalizeUserAgent(rawUa: string | undefined): string {
  if (!rawUa) return '';
  return String(rawUa)
    .split('/')[0]
    .split(' ')[0]
    .replace(/[^\x20-\x7E]/g, '')
    .slice(0, 64);
}

export function parseWorkerName(
  rawName: string | undefined,
  address?: string
): string {
  const name = String(rawName ?? '');
  if (!name) return '';
  if (address && name === address) return '';
  if (name.includes('.')) {
    const parts = name.split('.');
    return parts.length > 1 ? parts[1] : parts[0];
  }
  if (name.includes('_')) {
    const parts = name.split('_');
    return parts.length > 1 ? parts[1] : parts[0];
  }
  return name;
}

/**
 * Safely converts a potentially float value to a BigInt string, preserving precision for large numbers.
 * Handles numbers, strings, and undefined values. Takes only the integer part before any decimal.
 * @param value - The value to convert (number, string, or undefined)
 * @returns BigInt string representation of the integer part
 */
export function bigIntStringFromFloatLike(value: number | string | undefined): string {
  const s = String(value ?? '0');
  const intPart = s.split(/[.,]/)[0].replace(/[^0-9-]/g, '') || '0';
  return BigInt(intPart).toString();
}

/**
 * Safely parses a float value with a fallback for invalid inputs.
 * @param value - The value to parse
 * @param fallback - The fallback value if parsing fails (default: 0)
 * @returns The parsed float or the fallback value
 */
export function safeParseFloat(value: any, fallback: number = 0): number {
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
