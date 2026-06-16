/**
 * @jest-environment node
 *
 * Unit tests for recordBestDiff — the event-driven high-score capture.
 *
 * These assert the SQL contract that makes top_best_diffs an immutable, identity-keyed ledger.
 * End-to-end behavior against Postgres (backfill, invariant, re-import dedup) is covered by the
 * integration script in .local/test-best-diffs-immutable-ledger.ts.
 */

import { recordBestDiff } from '../../lib/api';

function makeManager() {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const manager = {
    query: jest.fn(async (sql: string, params?: unknown[]) => {
      calls.push({ sql, params: params ?? [] });
      return [];
    }),
  };
  return { manager, calls };
}

const sample = {
  workerId: 42,
  userAddress: '1WALLETxxxxxxxxxxxxxxxxxxxxxxxxx',
  workerName: 'rig1',
  bestEver: 713806779372.5114,
  device: 'MRR-Hash',
};

describe('recordBestDiff — SQL contract', () => {
  it('issues a single upsert', async () => {
    const { manager, calls } = makeManager();
    await recordBestDiff(manager, sample);
    expect(manager.query).toHaveBeenCalledTimes(1);
    expect(calls[0].sql).toMatch(/INSERT INTO "top_best_diffs"/i);
  });

  it('keys identity on (user_address, worker_name), not workerId', async () => {
    const { manager } = makeManager();
    await recordBestDiff(manager, sample);
    const sql = (manager.query as jest.Mock).mock.calls[0][0] as string;
    expect(sql).toMatch(
      /ON CONFLICT\s*\("user_address",\s*"worker_name"\)\s+WHERE\s+"user_address"\s+IS\s+NOT\s+NULL/i
    );
    // must NOT conflict on workerId (the bug we are fixing)
    expect(sql).not.toMatch(/ON CONFLICT\s*\("workerId"\)/i);
  });

  it('only ratchets upward (guard prevents downgrade / duplicate of an equal best)', async () => {
    const { manager } = makeManager();
    await recordBestDiff(manager, sample);
    const sql = (manager.query as jest.Mock).mock.calls[0][0] as string;
    expect(sql).toMatch(/WHERE EXCLUDED\.difficulty > "top_best_diffs"\.difficulty/);
  });

  it('never deletes — the upsert is the only write (immutability)', async () => {
    const { manager } = makeManager();
    await recordBestDiff(manager, sample);
    const sql = (manager.query as jest.Mock).mock.calls[0][0] as string;
    expect(sql).not.toMatch(/DELETE/i);
  });

  it('passes the identity + score as bound params in order', async () => {
    const { manager, calls } = makeManager();
    await recordBestDiff(manager, sample);
    expect(calls[0].params).toEqual([
      sample.workerId,
      sample.userAddress,
      sample.workerName,
      sample.bestEver,
      sample.device,
    ]);
  });
});
