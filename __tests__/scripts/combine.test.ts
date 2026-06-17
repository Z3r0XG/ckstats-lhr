/**
 * @jest-environment node
 *
 * Unit tests for the multi-region combine (pure functions — no I/O/DB/env).
 * Expected hashrate sums are computed via convertHashrateFloat so the asserts test the
 * SUM/MAX/MIN/dedup behavior, not a hardcoded unit scale.
 */
import {
  getEndpoints,
  combineUserData,
  combinePoolStatus,
} from '../../scripts/combine';
import { convertHashrateFloat } from '../../utils/helpers';

const conv = (s: string) => convertHashrateFloat(s);

// build a region's UserData with string-unit hashrates (as ckpool actually sends)
function region(authorised: number, workers: any[]): any {
  return {
    authorised,
    hashrate1m: '0', hashrate5m: '0', hashrate1hr: '0', hashrate1d: '0', hashrate7d: '0',
    lastshare: 0, workers: workers.length, shares: 0, bestshare: '0', bestever: '0',
    worker: workers,
  };
}
function worker(o: Partial<any>): any {
  return {
    workername: o.workername, useragent: o.useragent ?? '',
    hashrate1m: '0', hashrate5m: o.hashrate5m ?? '0', hashrate1hr: '0',
    hashrate1d: '0', hashrate7d: '0',
    lastshare: o.lastshare ?? 0, started: o.started ?? 0,
    shares: o.shares ?? 0, bestshare: o.bestshare ?? '0', bestever: o.bestever ?? '0',
  };
}

describe('getEndpoints', () => {
  const saved = { ...process.env };
  afterEach(() => { process.env = { ...saved }; });

  it('parses API_URLS comma list (trim + drop empties)', () => {
    process.env.API_URLS = ' https://a.com, https://b.com ,, https://c.com ';
    expect(getEndpoints()).toEqual(['https://a.com', 'https://b.com', 'https://c.com']);
  });
  it('falls back to single API_URL when API_URLS unset', () => {
    delete process.env.API_URLS;
    process.env.API_URL = '/var/log/ckpool';
    expect(getEndpoints()).toEqual(['/var/log/ckpool']);
  });
  it('returns [] when neither is set', () => {
    delete process.env.API_URLS;
    delete process.env.API_URL;
    expect(getEndpoints()).toEqual([]);
  });
});

describe('combineUserData', () => {
  it('unions distinct workers across regions and derives user totals', () => {
    const r1 = region(1000, [worker({ workername: 'A.rig1', hashrate5m: '5T', bestever: 700e9 })]);
    const r2 = region(2000, [worker({ workername: 'A.rig2', hashrate5m: '3T', bestever: 200e9 })]);
    const c = combineUserData([r1, r2], 'A');
    expect(c.workerCount).toBe(2);
    expect(c.hashrate5m).toBeCloseTo(conv('5T') + conv('3T'));
    expect(c.bestEver).toBe(700e9);   // max across the two workers (bestever is a plain number)
    expect(c.authorised).toBe(1000);                 // MIN
  });

  it('dedups the SAME worker across regions (failover): sum hashrate, max best/lastshare, UA from latest', () => {
    const r1 = region(1000, [worker({ workername: 'A.rig1', hashrate5m: '5T', lastshare: 100, started: 0, bestever: 700e9, useragent: 'cgminer' })]);
    const r2 = region(500,  [worker({ workername: 'A.rig1', hashrate5m: '3T', lastshare: 200, started: 12345, bestever: 500e9, useragent: 'bmminer' })]);
    const c = combineUserData([r1, r2], 'A');
    expect(c.workerCount).toBe(1);                          // deduped, NOT 2
    const w = c.workers[0];
    expect(w.hashrate5m).toBeCloseTo(conv('5T') + conv('3T')); // SUM
    expect(w.bestEver).toBe(700e9);                           // MAX
    expect(w.lastShare).toBe(200);                            // MAX
    expect(w.started).toBe(12345);                           // MAX (the connected region)
    expect(w.userAgent).toBe('bmminer');                     // from most-recent lastshare region
    expect(c.authorised).toBe(500);                          // MIN
  });

  it('blank worker name (wallet-only) is its own identity', () => {
    const r1 = region(1000, [worker({ workername: 'A', hashrate5m: '2T' })]); // workername === address → name ''
    const c = combineUserData([r1], 'A');
    expect(c.workers.map((w) => w.name)).toEqual(['']);
    expect(c.workerCount).toBe(1);
  });
});

describe('combinePoolStatus', () => {
  it('sums hashrate/accepted/SPS/counts, maxes bestshare, takes one netdiff, merges UserAgents', () => {
    const r1 = {
      hashrate5m: '5T', accepted: 100, rejected: 1, accepted_count: 1000, rejected_count: 10,
      bestshare: 700, netdiff: 486e9, SPS1m: 10,
      UserAgents: [{ ua: 'bitaxe', devices: 2, hashrate5m: '1T', bestshare: 50 }],
    };
    const r2 = {
      hashrate5m: '3T', accepted: 200, rejected: 2, accepted_count: 2000, rejected_count: 20,
      bestshare: 900, netdiff: 486e9, SPS1m: 20,
      UserAgents: [
        { ua: 'bitaxe', devices: 3, hashrate5m: '2T', bestshare: 80 },
        { ua: 'cgminer', devices: 1, hashrate5m: '4T', bestshare: 30 },
      ],
    };
    const c = combinePoolStatus([r1, r2]);
    expect(c.hashrate5m).toBeCloseTo(conv('5T') + conv('3T'));
    expect(c.accepted).toBe(300);
    expect(c.rejected).toBe(3);
    expect(c.acceptedCount).toBe(3000);
    expect(c.rejectedCount).toBe(30);
    expect(c.bestshare).toBe(900);            // MAX
    expect(c.netdiff).toBe(486e9);            // identical → take one
    expect(c.SPS1m).toBe(30);                 // SUM
    const bitaxe = c.userAgents.find((u) => u.ua === 'bitaxe')!;
    expect(bitaxe.devices).toBe(5);                              // SUM
    expect(bitaxe.hashrate5m).toBeCloseTo(conv('1T') + conv('2T')); // SUM
    expect(bitaxe.bestshare).toBe(80);                          // MAX
    expect(c.userAgents.find((u) => u.ua === 'cgminer')!.devices).toBe(1);
  });
});
