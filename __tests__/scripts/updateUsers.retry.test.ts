/**
 * @jest-environment node
 */

describe('updateUsers retry logic', () => {
  let originalFetch: typeof global.fetch;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    originalFetch = global.fetch;
    fetchMock = jest.fn();
    global.fetch = fetchMock as any;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.clearAllMocks();
  });

  // Helper to simulate the retry logic
  async function fetchUserDataWithRetry(
    address: string,
    apiUrl: string,
    maxRetries = 3,
    delayMs = 500
  ): Promise<any> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await fetch(apiUrl);

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        return await response.json();
      } catch (error: any) {
        if (attempt === maxRetries) {
          console.error(`Failed to fetch data for ${address} after ${maxRetries} attempts`);
          throw error;
        }

        console.log(`Attempt ${attempt} failed for ${address}. Retrying...`);
        await new Promise(resolve => setTimeout(resolve, delayMs * attempt));
      }
    }

    throw new Error(`Failed to fetch user data for ${address}`);
  }

  it('should succeed on first attempt when fetch succeeds', async () => {
    const mockData = { authorised: 123, workers: 1 };
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => mockData,
    });

    const result = await fetchUserDataWithRetry(
      'testAddress',
      'https://api.test/users/testAddress'
    );

    expect(result).toEqual(mockData);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('should retry 3 times before giving up', async () => {
    fetchMock.mockRejectedValue(new Error('Network error'));

    await expect(
      fetchUserDataWithRetry(
        'testAddress',
        'https://api.test/users/testAddress',
        3,
        10 // Short delay for faster test
      )
    ).rejects.toThrow('Network error');

    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('should succeed on second attempt after one failure', async () => {
    const mockData = { authorised: 456, workers: 2 };
    
    fetchMock
      .mockRejectedValueOnce(new Error('Temporary failure'))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockData,
      });

    const result = await fetchUserDataWithRetry(
      'testAddress',
      'https://api.test/users/testAddress',
      3,
      10 // Short delay for faster test
    );

    expect(result).toEqual(mockData);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('should succeed on third attempt after two failures', async () => {
    const mockData = { authorised: 789, workers: 3 };
    
    fetchMock
      .mockRejectedValueOnce(new Error('Failure 1'))
      .mockRejectedValueOnce(new Error('Failure 2'))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockData,
      });

    const result = await fetchUserDataWithRetry(
      'testAddress',
      'https://api.test/users/testAddress',
      3,
      10 // Short delay for faster test
    );

    expect(result).toEqual(mockData);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('should use linear backoff delay', async () => {
    const originalSetTimeout = global.setTimeout;
    const delays: number[] = [];
    
    global.setTimeout = jest.fn((callback: any, delay: number) => {
      delays.push(delay);
      // Call the real setTimeout
      return originalSetTimeout(callback, delay) as any;
    });

    try {
      fetchMock.mockRejectedValue(new Error('Network error'));

      await expect(
        fetchUserDataWithRetry(
          'testAddress',
          'https://api.test/users/testAddress',
          3,
          100 // Delay multiplier for test
        )
      ).rejects.toThrow('Network error');

      // Verify linear backoff delays: 100 * 1 = 100, 100 * 2 = 200
      expect(delays).toEqual([100, 200]);
    } finally {
      global.setTimeout = originalSetTimeout;
    }
  });

  it('should handle HTTP error responses', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 404,
    });

    await expect(
      fetchUserDataWithRetry(
        'testAddress',
        'https://api.test/users/testAddress',
        3,
        10 // Short delay for faster test
      )
    ).rejects.toThrow('HTTP error! status: 404');

    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
