/**
 * Calculate exponential backoff interval for failed queries.
 *
 * Uses 2^(attempts-1) multiplier starting from baseInterval.
 * Capped at maxInterval to prevent excessive delays.
 *
 * @param attempts - Number of failed attempts (1-indexed)
 * @param baseInterval - Base interval in milliseconds (e.g., 60000 for 60s)
 * @param maxInterval - Maximum interval cap in milliseconds (e.g., 120000 for 120s)
 * @returns Calculated backoff interval in milliseconds
 *
 * @example
 * calculateBackoff(1, 60000, 120000) // => 60000 (60s)
 * calculateBackoff(2, 60000, 120000) // => 120000 (120s, capped)
 * calculateBackoff(3, 60000, 120000) // => 120000 (would be 240s, but capped)
 */
export function calculateBackoff(
  attempts: number,
  baseInterval: number,
  maxInterval: number
): number {
  return Math.min(maxInterval, baseInterval * 2 ** (attempts - 1));
}
