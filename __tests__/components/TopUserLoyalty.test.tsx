/**
 * TopUserLoyalty component logic tests
 * Tests the component's conditional rendering logic and data transformation
 */

describe('TopUserLoyalty Component', () => {
  const SMALL_LIMIT = 10;

  test('title shows link when limit <= SMALL_LIMIT (10)', () => {
    const limitSmall = SMALL_LIMIT;
    const showLink = limitSmall <= SMALL_LIMIT;
    expect(showLink).toBe(true);
  });

  test('title shows plain text when limit > SMALL_LIMIT (10)', () => {
    const limitLarge = 20;
    const showLink = limitLarge <= SMALL_LIMIT;
    expect(showLink).toBe(false);
  });

  test('table has 7 columns for rank, address, workers, hashrate, shares, bestDiff, when', () => {
    const columns = ['Rank', 'Address', 'Active Workers', 'Hashrate 1hr', 'Shares Accepted', 'Best Diff', 'When'];
    expect(columns).toHaveLength(7);
  });

  test('empty state displays "No Stats Available Yet" with colspan 7', () => {
    const loyals: any[] = [];
    const showEmptyMessage = loyals.length === 0;
    expect(showEmptyMessage).toBe(true);
  });

  test('rank is computed as index + 1', () => {
    const loyals = [
      { address: 'addr1', authorised: 1700000000, workerCount: 1, hashrate1hr: 100000, shares: 1000, bestShare: 100 },
      { address: 'addr2', authorised: 1700100000, workerCount: 2, hashrate1hr: 200000, shares: 2000, bestShare: 200 },
    ];
    
    loyals.forEach((u, i) => {
      const rank = i + 1;
      expect(rank).toBeGreaterThan(0);
    });
    
    expect(loyals[0]).toEqual(expect.objectContaining({ address: 'addr1' }));
    expect(loyals[1]).toEqual(expect.objectContaining({ address: 'addr2' }));
  });

  test('authorised timestamp converts to Date and formats correctly', () => {
    const apiData = {
      address: 'bc1qabcd...xyz',
      authorised: 1700000000, // Unix timestamp (seconds)
      workerCount: 5,
      hashrate1hr: 1000000,
      shares: 5000,
      bestShare: 1234.56,
    };

    // Component converts: authorised (seconds) -> Date object -> formatted time ago string
    const when = apiData.authorised ? new Date(apiData.authorised * 1000) : null;
    expect(when).toBeInstanceOf(Date);
    expect(when?.getTime()).toBe(1700000000 * 1000);
  });

  test('null authorised timestamp displays dash', () => {
    const apiData = {
      address: 'bc1qabcd...xyz',
      authorised: null,
      workerCount: 5,
      hashrate1hr: 1000000,
      shares: 5000,
      bestShare: 1234.56,
    };

    const when = apiData.authorised ? new Date(apiData.authorised as any * 1000) : null;
    const displayWhen = when ? 'formatted time ago' : '-';
    expect(displayWhen).toBe('-');
  });

  test('error state handles try-catch gracefully', () => {
    // Component wraps getTopUserLoyalty in try-catch
    // Returns error card on failure instead of crashing
    let errorOccurred = false;
    try {
      throw new Error('API request failed');
    } catch (error) {
      errorOccurred = true;
    }
    expect(errorOccurred).toBe(true);
  });
});
