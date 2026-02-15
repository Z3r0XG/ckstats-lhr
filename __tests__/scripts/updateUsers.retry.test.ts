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

// Mock delay and readJsonStable functions
jest.mock('../../utils/readFileStable', () => ({
  ...jest.requireActual('../../utils/readFileStable'),
  delay: jest.fn().mockResolvedValue(undefined),
  readJsonStable: jest.fn(),
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

  describe('Filesystem fallback behavior', () => {
    const { validateAndResolveUserPath } = require('../../utils/validateLocalPath');
    const { readJsonStable } = readFileStableModule;

    beforeEach(() => {
      // Set API_URL to a filesystem path to trigger ERR_INVALID_URL
      process.env.API_URL = '/local/path/to/logs';
      jest.clearAllMocks();
    });

    it('should convert ENOENT errors to FileNotFoundError', async () => {
      // Simulate fetch throwing ERR_INVALID_URL
      const errInvalidUrl = new Error('Invalid URL');
      (errInvalidUrl as any).cause = { code: 'ERR_INVALID_URL' };
      fetchMock.mockRejectedValue(errInvalidUrl);

      // Mock filesystem operations
      validateAndResolveUserPath.mockReturnValue('/safe/path/testAddress.json');
      
      // Simulate ENOENT error from readJsonStable
      const enoentError = new Error('File not found') as any;
      enoentError.code = 'ENOENT';
      (readJsonStable as jest.Mock).mockRejectedValue(enoentError);

      // Verify FileNotFoundError is thrown with correct message
      await expect(
        fetchUserDataWithRetry('testAddress', 'file:///local/path/to/logs/testAddress')
      ).rejects.toThrow(FileNotFoundError);

      await expect(
        fetchUserDataWithRetry('testAddress', 'file:///local/path/to/logs/testAddress')
      ).rejects.toThrow('User file not found: testAddress');

      // Verify the error is catchable with instanceof
      try {
        await fetchUserDataWithRetry('testAddress', 'file:///local/path/to/logs/testAddress');
        fail('Should have thrown FileNotFoundError');
      } catch (error) {
        expect(error instanceof FileNotFoundError).toBe(true);
      }
    });

    it('should propagate non-ENOENT file errors without conversion', async () => {
      // Simulate fetch throwing ERR_INVALID_URL
      const errInvalidUrl = new Error('Invalid URL');
      (errInvalidUrl as any).cause = { code: 'ERR_INVALID_URL' };
      fetchMock.mockRejectedValue(errInvalidUrl);

      // Mock filesystem operations
      validateAndResolveUserPath.mockReturnValue('/safe/path/testAddress.json');
      
      // Simulate EACCES (permission denied) error from readJsonStable
      const eaccesError = new Error('Permission denied') as any;
      eaccesError.code = 'EACCES';
      (readJsonStable as jest.Mock).mockRejectedValue(eaccesError);

      await expect(
        fetchUserDataWithRetry('testAddress', 'file:///local/path/to/logs/testAddress')
      ).rejects.toThrow('Permission denied');

      // Verify it's NOT converted to FileNotFoundError
      try {
        await fetchUserDataWithRetry('testAddress', 'file:///local/path/to/logs/testAddress');
        fail('Should have thrown error');
      } catch (error) {
        expect(error instanceof FileNotFoundError).toBe(false);
        expect((error as any).code).toBe('EACCES');
      }
    });

    it('should successfully read from filesystem when file exists', async () => {
      const mockData = {
        authorised: 999,
        workers: 5,
        hashrate1m: 500,
        hashrate5m: 500,
        hashrate1hr: 500,
        hashrate1d: 500,
        hashrate7d: 500,
        lastshare: 5000,
        shares: '5000',
        bestshare: '5',
        bestever: '5',
        worker: []
      };

      // Simulate fetch throwing ERR_INVALID_URL
      const errInvalidUrl = new Error('Invalid URL');
      (errInvalidUrl as any).cause = { code: 'ERR_INVALID_URL' };
      fetchMock.mockRejectedValueOnce(errInvalidUrl);

      // Mock filesystem operations
      validateAndResolveUserPath.mockReturnValueOnce('/safe/path/testAddress.json');
      (readJsonStable as jest.Mock).mockResolvedValueOnce(mockData);

      const result = await fetchUserDataWithRetry(
        'testAddress',
        'file:///local/path/to/logs/testAddress'
      );

      expect(result).toEqual(mockData);
      expect(validateAndResolveUserPath).toHaveBeenCalledWith('testAddress', '/local/path/to/logs');
      expect(readJsonStable).toHaveBeenCalledWith('/safe/path/testAddress.json', {
        retries: 6,
        backoffMs: 50,
      });
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
