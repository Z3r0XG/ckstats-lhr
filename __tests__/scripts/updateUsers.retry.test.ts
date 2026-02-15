/**
 * @jest-environment node
 */

/**
 * Tests for fetchUserDataWithRetry function.
 * These tests import and test the actual implementation from updateUsers.ts
 */

import {
  fetchUserDataWithRetry,
  MAX_RETRIES,
  RETRY_DELAY_MS,
  FileNotFoundError,
} from '../../scripts/updateUsers';
import * as readFileStableModule from '../../utils/readFileStable';

// Mock delay function to speed up tests
jest.mock('../../utils/readFileStable', () => ({
  ...jest.requireActual('../../utils/readFileStable'),
  delay: jest.fn().mockResolvedValue(undefined),
}));

// Mock validateAndResolveUserPath
jest.mock('../../utils/validateLocalPath', () => ({
  validateAndResolveUserPath: jest.fn(),
}));

describe('updateUsers retry logic', () => {
  let originalFetch: typeof global.fetch;
  let fetchMock: jest.Mock;
  const originalEnv = process.env.API_URL;

  beforeEach(() => {
    originalFetch = global.fetch;
    fetchMock = jest.fn();
    global.fetch = fetchMock as any;
    jest.clearAllMocks();
    // Ensure API_URL is set to HTTP endpoint for these tests
    process.env.API_URL = 'https://solo.ckpool.org';
  });

  afterEach(() => {
    global.fetch = originalFetch;
    if (originalEnv === undefined) {
      delete process.env.API_URL;
    } else {
      process.env.API_URL = originalEnv;
    }
  });

  describe('HTTP fetch retry behavior', () => {
    it('should succeed on first attempt when fetch succeeds', async () => {
      const mockData = { 
        authorised: 123, 
        workers: 1,
        hashrate1m: 100,
        hashrate5m: 100,
        hashrate1hr: 100,
        hashrate1d: 100,
        hashrate7d: 100,
        lastshare: 1000,
        shares: '1000',
        bestshare: '1',
        bestever: '1',
        worker: []
      };
      
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
      expect(readFileStableModule.delay).not.toHaveBeenCalled();
    });

    it('should retry MAX_RETRIES times before giving up', async () => {
      fetchMock.mockRejectedValue(new Error('Network error'));

      await expect(
        fetchUserDataWithRetry(
          'testAddress',
          'https://api.test/users/testAddress'
        )
      ).rejects.toThrow('Network error');

      expect(fetchMock).toHaveBeenCalledTimes(MAX_RETRIES);
      expect(readFileStableModule.delay).toHaveBeenCalledTimes(MAX_RETRIES - 1);
    });

    it('should succeed on second attempt after one failure', async () => {
      const mockData = { 
        authorised: 456, 
        workers: 2,
        hashrate1m: 200,
        hashrate5m: 200,
        hashrate1hr: 200,
        hashrate1d: 200,
        hashrate7d: 200,
        lastshare: 2000,
        shares: '2000',
        bestshare: '2',
        bestever: '2',
        worker: []
      };
      
      fetchMock
        .mockRejectedValueOnce(new Error('Temporary failure'))
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockData,
        });

      const result = await fetchUserDataWithRetry(
        'testAddress',
        'https://api.test/users/testAddress'
      );

      expect(result).toEqual(mockData);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(readFileStableModule.delay).toHaveBeenCalledTimes(1);
      expect(readFileStableModule.delay).toHaveBeenCalledWith(RETRY_DELAY_MS * 1);
    });

    it('should succeed on third attempt after two failures', async () => {
      const mockData = { 
        authorised: 789, 
        workers: 3,
        hashrate1m: 300,
        hashrate5m: 300,
        hashrate1hr: 300,
        hashrate1d: 300,
        hashrate7d: 300,
        lastshare: 3000,
        shares: '3000',
        bestshare: '3',
        bestever: '3',
        worker: []
      };
      
      fetchMock
        .mockRejectedValueOnce(new Error('Failure 1'))
        .mockRejectedValueOnce(new Error('Failure 2'))
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockData,
        });

      const result = await fetchUserDataWithRetry(
        'testAddress',
        'https://api.test/users/testAddress'
      );

      expect(result).toEqual(mockData);
      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(readFileStableModule.delay).toHaveBeenCalledTimes(2);
    });

    it('should use linear backoff delay (attempt * RETRY_DELAY_MS)', async () => {
      fetchMock.mockRejectedValue(new Error('Network error'));

      await expect(
        fetchUserDataWithRetry(
          'testAddress',
          'https://api.test/users/testAddress'
        )
      ).rejects.toThrow('Network error');

      // Verify linear backoff: attempt 1 fails → delay(500*1), attempt 2 fails → delay(500*2)
      expect(readFileStableModule.delay).toHaveBeenNthCalledWith(1, RETRY_DELAY_MS * 1);
      expect(readFileStableModule.delay).toHaveBeenNthCalledWith(2, RETRY_DELAY_MS * 2);
    });

    it('should handle HTTP error responses with retries', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 404,
      });

      await expect(
        fetchUserDataWithRetry(
          'testAddress',
          'https://api.test/users/testAddress'
        )
      ).rejects.toThrow('HTTP error! status: 404');

      expect(fetchMock).toHaveBeenCalledTimes(MAX_RETRIES);
    });
  });

  describe('Constants', () => {
    it('should have MAX_RETRIES set to 3', () => {
      expect(MAX_RETRIES).toBe(3);
    });

    it('should have RETRY_DELAY_MS set to 500', () => {
      expect(RETRY_DELAY_MS).toBe(500);
    });
  });

});
