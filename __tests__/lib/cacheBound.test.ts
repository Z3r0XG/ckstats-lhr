import {
  getCached,
  cacheSet,
  cacheGet,
  cacheDeletePrefix,
  getCacheStats,
  CACHE_MAX_ENTRIES,
} from '../../lib/api';

// Exercises the real bounded-LRU cache via its public API.
beforeEach(() => cacheDeletePrefix(''));
afterEach(() => cacheDeletePrefix(''));

describe('bounded LRU cache', () => {
  it('caps total entries and evicts the oldest once over CACHE_MAX_ENTRIES', () => {
    const over = CACHE_MAX_ENTRIES + 50;
    for (let i = 0; i < over; i++) cacheSet(`k${i}`, i, 60);

    expect(getCacheStats().size).toBeLessThanOrEqual(CACHE_MAX_ENTRIES);
    expect(cacheGet('k0')).toBeUndefined(); // oldest evicted
    expect(cacheGet(`k${over - 1}`)).toBeDefined(); // newest retained
  });

  it('a getCached read bumps recency so the key survives an eviction wave', async () => {
    for (let i = 0; i < CACHE_MAX_ENTRIES; i++) cacheSet(`k${i}`, i, 60);

    // Read k0 through getCached (cache hit → bumps it to most-recently-used; loader must not run).
    const loader = jest.fn(async () => -1);
    await getCached('k0', 60, loader);
    expect(loader).not.toHaveBeenCalled();

    // Insert 50 new keys → evicts the 50 oldest. k0 was bumped, so it survives; k1 (now oldest) goes.
    for (let i = 0; i < 50; i++) cacheSet(`new${i}`, i, 60);

    expect(cacheGet('k0')).toBeDefined();
    expect(cacheGet('k1')).toBeUndefined();
  });
});
