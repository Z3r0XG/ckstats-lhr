// Pure scheduling helpers for the in-process ingest loop's users-half cadence.

/** Resolve POOL_USERS_INTERVAL_SECONDS: a positive number, else the cycle interval. */
export function resolveUsersIntervalSeconds(
  raw: string | undefined,
  fallbackSec: number
): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallbackSec;
}

/** True when the users half is due: never run yet (lastRunMs ≤ 0), or at least usersIntervalSec has
 *  elapsed since it last ran. */
export function isUsersHalfDue(
  lastRunMs: number,
  nowMs: number,
  usersIntervalSec: number
): boolean {
  if (lastRunMs <= 0) return true; // never run yet → due
  return nowMs - lastRunMs >= usersIntervalSec * 1000;
}

/** Users clock after a due tick: the tick's start when the cycle ran, else the previous value. */
export function advanceUsersClock(
  prevLastRunMs: number,
  tickStartMs: number,
  ran: boolean
): number {
  return ran ? tickStartMs : prevLastRunMs;
}
