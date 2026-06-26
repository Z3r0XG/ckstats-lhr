import {
  resolveUsersIntervalSeconds,
  isUsersHalfDue,
  advanceUsersClock,
} from '../../lib/ingestSchedule';

describe('resolveUsersIntervalSeconds', () => {
  it('uses a positive numeric value', () => {
    expect(resolveUsersIntervalSeconds('180', 60)).toBe(180);
  });

  it('falls back to the cycle interval for unset/blank/non-numeric/zero/negative', () => {
    for (const bad of [undefined, '', 'abc', '0', '-5', 'NaN']) {
      expect(resolveUsersIntervalSeconds(bad, 60)).toBe(60);
    }
  });
});

describe('isUsersHalfDue', () => {
  it('is due when never run (lastRun ≤ 0), independent of the clock magnitude', () => {
    expect(isUsersHalfDue(0, 0, 180)).toBe(true);
    expect(isUsersHalfDue(0, 5, 180)).toBe(true);
    expect(isUsersHalfDue(-1, 1000, 180)).toBe(true);
  });

  it('after it has run, is due only once the interval has elapsed', () => {
    expect(isUsersHalfDue(1000, 1000 + 179_000, 180)).toBe(false);
    expect(isUsersHalfDue(1000, 1000 + 180_000, 180)).toBe(true);
  });
});

// Drive a simulated tick sequence with the real scheduling functions, exactly as startIngestLoop
// does (status every tick; users when due; advance the users clock only when the cycle ran).
// START stands in for Date.now()'s epoch so the lastUsers=0 sentinel makes the first tick due.
describe('users-half cadence in the loop', () => {
  const USERS = 180;
  const TICK = 60;
  const START = 10_000_000; // any value ≥ USERS*1000 reproduces the first-tick-due sentinel

  it('runs the users half on the first tick and then once per interval', () => {
    let lastUsers = 0;
    const ranAtSec: number[] = [];
    for (let now = START; now <= START + 600_000; now += TICK * 1000) {
      if (isUsersHalfDue(lastUsers, now, USERS)) {
        ranAtSec.push((now - START) / 1000);
        lastUsers = advanceUsersClock(lastUsers, now, true); // cycle ran
      }
    }
    expect(ranAtSec).toEqual([0, 180, 360, 540]); // first tick, then every 180s
  });

  it('does not skip the window when a due cycle loses the lock (runCycle → null)', () => {
    let lastUsers = 0;
    // First due tick hits lock contention (ran=false); next tick must still be due and succeed.
    const ranByTick = new Map<number, boolean>([
      [START, false],
      [START + 60_000, true],
    ]);
    const ranAtSec: number[] = [];
    const ticks = [START, START + 60_000, START + 120_000, START + 180_000];
    for (const now of ticks) {
      if (isUsersHalfDue(lastUsers, now, USERS)) {
        const ran = ranByTick.get(now) ?? true;
        if (ran) ranAtSec.push((now - START) / 1000);
        lastUsers = advanceUsersClock(lastUsers, now, ran);
      }
    }
    // 0s due but failed (not counted) → 60s still due, succeeds → not due again until 60+180=240s
    expect(ranAtSec).toEqual([60]);
    expect(isUsersHalfDue(lastUsers, START + 180_000, USERS)).toBe(false);
    expect(isUsersHalfDue(lastUsers, START + 240_000, USERS)).toBe(true);
  });

  it('keeps the clock unchanged on a failed run (the contention guard)', () => {
    // advanceUsersClock must NOT move the clock forward when the cycle did not run.
    expect(advanceUsersClock(1000, 5000, false)).toBe(1000);
    expect(advanceUsersClock(1000, 5000, true)).toBe(5000);
  });
});
