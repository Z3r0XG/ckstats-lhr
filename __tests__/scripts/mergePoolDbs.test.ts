/**
 * @jest-environment node
 *
 * Unit tests for the PURE cutover-merge rules (scripts/mergePoolDbs.ts). The pg I/O wrapper is
 * exercised internally against restored backups (per the testing-scope policy); here we pin the
 * merge semantics that the SQL upserts mirror.
 */
import {
  mergeUsers,
  mergeDiffs,
  SourceUser,
  SourceDiff,
} from '../../scripts/mergePoolDbs';

const user = (over: Partial<SourceUser>): SourceUser => ({
  address: 'A',
  authorised: '0',
  isActive: false,
  isPublic: true,
  lastActivatedAt: null,
  createdAt: new Date('2024-01-01T00:00:00Z'),
  ...over,
});

const diff = (over: Partial<SourceDiff>): SourceDiff => ({
  user_address: 'A',
  worker_name: 'rig1',
  difficulty: 100,
  device: 'NMMiner',
  timestamp: new Date('2024-01-01T00:00:00Z'),
  workerId: 1,
  ...over,
});

describe('mergeUsers', () => {
  it('folds the same wallet across pools into one row (no double count)', () => {
    const out = mergeUsers([user({ address: 'A' }), user({ address: 'A' }), user({ address: 'B' })]);
    expect(out.map((u) => u.address).sort()).toEqual(['A', 'B']);
  });

  it('authorised = MIN of positive values; 0 is ignored', () => {
    expect(mergeUsers([user({ authorised: '0' }), user({ authorised: '1771000000' })])[0].authorised).toBe('1771000000');
    expect(mergeUsers([user({ authorised: '1771000500' }), user({ authorised: '1771000000' })])[0].authorised).toBe('1771000000');
    expect(mergeUsers([user({ authorised: '0' }), user({ authorised: '0' })])[0].authorised).toBe('0');
  });

  it('isActive = OR (active anywhere ⇒ active)', () => {
    expect(mergeUsers([user({ isActive: false }), user({ isActive: true })])[0].isActive).toBe(true);
    expect(mergeUsers([user({ isActive: false }), user({ isActive: false })])[0].isActive).toBe(false);
  });

  it('isPublic = AND (private anywhere ⇒ private)', () => {
    expect(mergeUsers([user({ isPublic: true }), user({ isPublic: false })])[0].isPublic).toBe(false);
    expect(mergeUsers([user({ isPublic: true }), user({ isPublic: true })])[0].isPublic).toBe(true);
  });

  it('lastActivatedAt = MAX (handling null), createdAt = MIN', () => {
    const out = mergeUsers([
      user({ lastActivatedAt: new Date('2024-05-01Z'), createdAt: new Date('2024-02-01Z') }),
      user({ lastActivatedAt: null, createdAt: new Date('2024-01-01Z') }),
      user({ lastActivatedAt: new Date('2024-06-01Z'), createdAt: new Date('2024-03-01Z') }),
    ]);
    expect(out[0].lastActivatedAt).toEqual(new Date('2024-06-01Z'));
    expect(out[0].createdAt).toEqual(new Date('2024-01-01Z'));
  });
});

describe('mergeDiffs', () => {
  it('keeps the MAX difficulty per identity (failover dedup)', () => {
    const { merged, ghosts } = mergeDiffs([
      diff({ user_address: 'A', worker_name: 'rig1', difficulty: 100 }),
      diff({ user_address: 'A', worker_name: 'rig1', difficulty: 250 }),
      diff({ user_address: 'A', worker_name: 'rig2', difficulty: 50 }),
    ]);
    expect(ghosts).toHaveLength(0);
    expect(merged).toHaveLength(2);
    expect(merged.find((d) => d.worker_name === 'rig1')!.difficulty).toBe(250);
    expect(merged.find((d) => d.worker_name === 'rig2')!.difficulty).toBe(50);
  });

  it('treats (wallet, worker_name) as the identity — same name across wallets stays separate', () => {
    const { merged } = mergeDiffs([
      diff({ user_address: 'A', worker_name: 'rig1', difficulty: 100 }),
      diff({ user_address: 'B', worker_name: 'rig1', difficulty: 200 }),
    ]);
    expect(merged).toHaveLength(2);
  });

  it('on a difficulty tie keeps the EARLIEST timestamp (matches leaderboard ORDER BY)', () => {
    const early = new Date('2024-01-01Z');
    const late = new Date('2024-02-01Z');
    const { merged } = mergeDiffs([
      diff({ difficulty: 100, timestamp: late, workerId: 9 }),
      diff({ difficulty: 100, timestamp: early, workerId: 7 }),
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].timestamp).toEqual(early);
    expect(merged[0].workerId).toBe(7);
  });

  it('separates NULL-identity ghost rows for caller handling', () => {
    const { merged, ghosts } = mergeDiffs([
      diff({ user_address: 'A', worker_name: 'rig1', difficulty: 100 }),
      diff({ user_address: null, worker_name: null, difficulty: 999 }),
    ]);
    expect(merged).toHaveLength(1);
    expect(ghosts).toHaveLength(1);
    expect(ghosts[0].difficulty).toBe(999);
  });
});
