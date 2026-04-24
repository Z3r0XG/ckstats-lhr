/**
 * @jest-environment node
 *
 * Unit tests for refreshTopBestDiffsIfNeeded.
 *
 * These tests verify control-flow and the SQL contract (upsert / re-rank / trim).
 * They do NOT verify that the SQL produces the correct results in Postgres — that
 * is covered by the integration tests in .local/test-high-scores-device-immutability.ts.
 */

import { refreshTopBestDiffsIfNeeded } from '../../scripts/seed';

// ─── helpers ────────────────────────────────────────────────────────────────

function makeDb(overrides: {
  workerTableExists?: boolean;
  topBestDiffsTableExists?: boolean;
  lastComputedAt?: Date | null;
} = {}) {
  const {
    workerTableExists = true,
    topBestDiffsTableExists = true,
    lastComputedAt = null,
  } = overrides;

  const managerQueries: string[] = [];

  const manager = {
    query: jest.fn(async (sql: string) => {
      managerQueries.push(sql);
      return [];
    }),
  };

  let queryCallCount = 0;
  const db = {
    query: jest.fn(async (sql: string) => {
      queryCallCount++;
      // Call 1: Worker table existence check
      if (queryCallCount === 1) return workerTableExists ? [{ table_name: 'Worker' }] : [];
      // Call 2: top_best_diffs table existence check
      if (queryCallCount === 2) return topBestDiffsTableExists ? [{ table_name: 'top_best_diffs' }] : [];
      // Call 3: MAX(computed_at) check
      if (queryCallCount === 3) return [{ last_computed: lastComputedAt ?? null }];
      return [];
    }),
    transaction: jest.fn(async (cb: (manager: any) => Promise<void>) => {
      await cb(manager);
    }),
    _managerQueries: managerQueries,
  };

  return { db, manager, managerQueries };
}

// ─── table-existence guards ──────────────────────────────────────────────────

describe('refreshTopBestDiffsIfNeeded — table guards', () => {
  it('skips when Worker table does not exist', async () => {
    const { db } = makeDb({ workerTableExists: false });

    await refreshTopBestDiffsIfNeeded(db);

    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('skips when top_best_diffs table does not exist', async () => {
    const { db } = makeDb({ topBestDiffsTableExists: false });

    await refreshTopBestDiffsIfNeeded(db);

    expect(db.transaction).not.toHaveBeenCalled();
  });
});

// ─── throttle check ──────────────────────────────────────────────────────────

describe('refreshTopBestDiffsIfNeeded — throttle', () => {
  it('skips when last computed less than 1 hour ago', async () => {
    const recent = new Date(Date.now() - 30 * 60 * 1000); // 30 min ago
    const { db } = makeDb({ lastComputedAt: recent });

    await refreshTopBestDiffsIfNeeded(db);

    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('runs when last computed more than 1 hour ago', async () => {
    const old = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2 hours ago
    const { db } = makeDb({ lastComputedAt: old });

    await refreshTopBestDiffsIfNeeded(db);

    expect(db.transaction).toHaveBeenCalledTimes(1);
  });

  it('runs when table is empty (null computed_at)', async () => {
    const { db } = makeDb({ lastComputedAt: null });

    await refreshTopBestDiffsIfNeeded(db);

    expect(db.transaction).toHaveBeenCalledTimes(1);
  });
});

// ─── SQL contract ────────────────────────────────────────────────────────────

describe('refreshTopBestDiffsIfNeeded — SQL contract', () => {
  async function runAndGetSql() {
    const { db, managerQueries } = makeDb({ lastComputedAt: null });
    await refreshTopBestDiffsIfNeeded(db);
    return managerQueries;
  }

  it('uses upsert (ON CONFLICT) instead of DELETE + re-insert', async () => {
    const sqls = await runAndGetSql();

    const upsert = sqls.find((s) => /ON CONFLICT/i.test(s));
    expect(upsert).toBeDefined();

    // The old bug: full wipe before re-inserting every row
    const fullWipe = sqls.find((s) => /DELETE FROM "top_best_diffs"/.test(s) && !/WHERE rank >/.test(s));
    expect(fullWipe).toBeUndefined();
  });

  it('upsert conflict target includes the partial index predicate', async () => {
    const sqls = await runAndGetSql();

    const upsert = sqls.find((s) => /ON CONFLICT/i.test(s))!;
    // Must match the partial unique index: ON CONFLICT ("workerId") WHERE "workerId" IS NOT NULL
    expect(upsert).toMatch(/ON CONFLICT\s*\("workerId"\)\s+WHERE\s+"workerId"\s+IS\s+NOT\s+NULL/i);
  });

  it('upsert only updates when new difficulty is higher', async () => {
    const sqls = await runAndGetSql();

    const upsert = sqls.find((s) => /ON CONFLICT/i.test(s))!;
    expect(upsert).toMatch(/WHERE EXCLUDED\.difficulty > "top_best_diffs"\.difficulty/);
  });

  it('re-ranks all rows by difficulty DESC after upsert', async () => {
    const sqls = await runAndGetSql();

    const rerank = sqls.find((s) => /ROW_NUMBER\(\) OVER/i.test(s));
    expect(rerank).toBeDefined();
    expect(rerank).toMatch(/ORDER BY difficulty DESC/i);
  });

  it('trims rows that fell outside the top N', async () => {
    const sqls = await runAndGetSql();

    const trim = sqls.find((s) => /DELETE FROM "top_best_diffs" WHERE rank >/.test(s));
    expect(trim).toBeDefined();
    expect(trim).toMatch(/rank > 10/);
  });

  it('touches computed_at on every row for throttle tracking', async () => {
    const sqls = await runAndGetSql();

    const touch = sqls.find((s) => /UPDATE "top_best_diffs" SET computed_at/.test(s) && !/ROW_NUMBER/.test(s));
    expect(touch).toBeDefined();
  });

  it('issues exactly 4 queries inside the transaction: upsert, touch, re-rank, trim', async () => {
    const sqls = await runAndGetSql();
    expect(sqls).toHaveLength(4);
  });
});
