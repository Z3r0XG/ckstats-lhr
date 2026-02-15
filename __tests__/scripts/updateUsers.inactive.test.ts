/**
 * @jest-environment node
 */

/**
 * Tests for the enhanced user inactive logic with grace period.
 * These tests import and test the actual exported functions from updateUsers.ts
 * to ensure we're testing real code paths, not duplicated logic.
 */

import {
  FileNotFoundError,
  SEVEN_DAYS_MS,
  shouldMarkUserInactive,
  calculateGracePeriodRemaining,
  repairNullLastActivatedAt,
} from '../../scripts/updateUsers';
import * as dbModule from '../../lib/db';
import { User } from '../../lib/entities/User';

// Mock the database module
jest.mock('../../lib/db');
jest.mock('../../lib/api');

describe('updateUsers inactive logic with grace period', () => {
  const now = Date.now();

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('FileNotFoundError', () => {
    it('should be throwable and identifiable by instanceof', () => {
      const error = new FileNotFoundError('User file not found: testAddress');
      
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(FileNotFoundError);
      expect(error.name).toBe('FileNotFoundError');
      expect(error.message).toBe('User file not found: testAddress');
    });

    it('should be catchable with instanceof check', () => {
      try {
        throw new FileNotFoundError('test');
      } catch (error) {
        expect(error instanceof FileNotFoundError).toBe(true);
      }
    });
  });

  describe('SEVEN_DAYS_MS constant', () => {
    it('should equal exactly 604800000 milliseconds', () => {
      expect(SEVEN_DAYS_MS).toBe(7 * 24 * 60 * 60 * 1000);
      expect(SEVEN_DAYS_MS).toBe(604800000);
    });
  });

  describe('shouldMarkUserInactive()', () => {
    it('should return { shouldMarkInactive: false } when shares are fresh (<7 days)', () => {
      const lastShareTimestamp = Math.floor((now - 3 * 24 * 60 * 60 * 1000) / 1000); // 3 days ago
      const lastActivatedAt = new Date(now - 10 * 24 * 60 * 60 * 1000); // 10 days ago (stale)
      const createdAt = new Date(now - 100 * 24 * 60 * 60 * 1000);
      
      const result = shouldMarkUserInactive(lastShareTimestamp, lastActivatedAt, createdAt, now);
      
      expect(result.shouldMarkInactive).toBe(false);
      expect(result.daysRemaining).toBeUndefined();
    });

    it('should return { shouldMarkInactive: false, daysRemaining } when shares stale but within grace period', () => {
      const lastShareTimestamp = Math.floor((now - 10 * 24 * 60 * 60 * 1000) / 1000); // 10 days ago
      const lastActivatedAt = new Date(now - 3 * 24 * 60 * 60 * 1000); // 3 days ago
      const createdAt = new Date(now - 100 * 24 * 60 * 60 * 1000);
      
      const result = shouldMarkUserInactive(lastShareTimestamp, lastActivatedAt, createdAt, now);
      
      expect(result.shouldMarkInactive).toBe(false);
      expect(result.daysRemaining).toBe(4); // 7 - 3 = 4 days remaining
    });

    it('should return { shouldMarkInactive: true } when both shares and lastActivatedAt exceed 7 days', () => {
      const lastShareTimestamp = Math.floor((now - 10 * 24 * 60 * 60 * 1000) / 1000); // 10 days ago
      const lastActivatedAt = new Date(now - 10 * 24 * 60 * 60 * 1000); // 10 days ago
      const createdAt = new Date(now - 100 * 24 * 60 * 60 * 1000);
      
      const result = shouldMarkUserInactive(lastShareTimestamp, lastActivatedAt, createdAt, now);
      
      expect(result.shouldMarkInactive).toBe(true);
      expect(result.daysRemaining).toBeUndefined();
    });

    it('should use createdAt as fallback when lastActivatedAt is null', () => {
      const lastShareTimestamp = Math.floor((now - 10 * 24 * 60 * 60 * 1000) / 1000); // 10 days ago
      const lastActivatedAt = null;
      const createdAt = new Date(now - 2 * 24 * 60 * 60 * 1000); // 2 days ago (fresh)
      
      const result = shouldMarkUserInactive(lastShareTimestamp, lastActivatedAt, createdAt, now);
      
      // Should use createdAt (2 days ago) which is within grace period
      expect(result.shouldMarkInactive).toBe(false);
      expect(result.daysRemaining).toBe(5); // 7 - 2 = 5 days remaining
    });

    it('should mark inactive when lastActivatedAt is null and createdAt is stale', () => {
      const lastShareTimestamp = Math.floor((now - 10 * 24 * 60 * 60 * 1000) / 1000); // 10 days ago
      const lastActivatedAt = null;
      const createdAt = new Date(now - 10 * 24 * 60 * 60 * 1000); // 10 days ago (stale)
      
      const result = shouldMarkUserInactive(lastShareTimestamp, lastActivatedAt, createdAt, now);
      
      expect(result.shouldMarkInactive).toBe(true);
    });

    it('should handle grace period boundary (exactly 7 days) correctly', () => {
      const lastShareTimestamp = Math.floor((now - 10 * 24 * 60 * 60 * 1000) / 1000); // 10 days ago
      const lastActivatedAt = new Date(now - SEVEN_DAYS_MS); // exactly 7 days ago
      const createdAt = new Date(now - 100 * 24 * 60 * 60 * 1000);
      
      const result = shouldMarkUserInactive(lastShareTimestamp, lastActivatedAt, createdAt, now);
      
      // At exactly 7 days, grace period has expired (> not >=)
      expect(result.shouldMarkInactive).toBe(false);
      expect(result.daysRemaining).toBe(0);
    });
  });

  describe('calculateGracePeriodRemaining()', () => {
    it('should return correct days remaining when within grace period', () => {
      const lastActivatedAt = new Date(now - 3 * 24 * 60 * 60 * 1000); // 3 days ago
      
      const result = calculateGracePeriodRemaining(lastActivatedAt, now);
      
      expect(result).toBe(4); // 7 - 3 = 4 days remaining
    });

    it('should return 0 when grace period has expired', () => {
      const lastActivatedAt = new Date(now - 10 * 24 * 60 * 60 * 1000); // 10 days ago
      
      const result = calculateGracePeriodRemaining(lastActivatedAt, now);
      
      expect(result).toBe(0);
    });

    it('should return 7 when lastActivatedAt is now', () => {
      const lastActivatedAt = new Date(now);
      
      const result = calculateGracePeriodRemaining(lastActivatedAt, now);
      
      expect(result).toBe(7);
    });

    it('should ceil partial days correctly', () => {
      const lastActivatedAt = new Date(now - (3.5 * 24 * 60 * 60 * 1000)); // 3.5 days ago
      
      const result = calculateGracePeriodRemaining(lastActivatedAt, now);
      
      expect(result).toBe(4); // Math.ceil(3.5) = 4 days remaining
    });
  });

  describe('repairNullLastActivatedAt()', () => {
    it('should repair users with NULL lastActivatedAt using bulk UPDATE', async () => {
      const mockQueryBuilder = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 2 }),
      };

      const mockUserRepository = {
        createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
      };

      const mockDb = {
        getRepository: jest.fn().mockReturnValue(mockUserRepository),
      };

      jest.spyOn(dbModule, 'getDb').mockResolvedValue(mockDb as any);

      await repairNullLastActivatedAt();

      expect(mockUserRepository.createQueryBuilder).toHaveBeenCalled();
      expect(mockQueryBuilder.update).toHaveBeenCalledWith(User);
      expect(mockQueryBuilder.set).toHaveBeenCalledWith({ lastActivatedAt: expect.any(Function) });
      expect(mockQueryBuilder.where).toHaveBeenCalledWith('lastActivatedAt IS NULL');
      expect(mockQueryBuilder.execute).toHaveBeenCalled();
    });

    it('should do nothing when no users have NULL lastActivatedAt', async () => {
      const mockQueryBuilder = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 0 }),
      };

      const mockUserRepository = {
        createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
      };

      const mockDb = {
        getRepository: jest.fn().mockReturnValue(mockUserRepository),
      };

      jest.spyOn(dbModule, 'getDb').mockResolvedValue(mockDb as any);

      await repairNullLastActivatedAt();

      expect(mockQueryBuilder.execute).toHaveBeenCalled();
      // Should not log anything when affected is 0
    });
  });

  describe('Grace period scenarios (integration-style tests)', () => {
    it('should handle fresh mining bypassing grace period check', () => {
      const lastShareTimestamp = Math.floor((now - 1 * 60 * 60 * 1000) / 1000); // 1 hour ago (fresh)
      const lastActivatedAt = new Date(now - 10 * 24 * 60 * 60 * 1000); // 10 days ago (stale)
      const createdAt = new Date(now - 100 * 24 * 60 * 60 * 1000);
      
      const result = shouldMarkUserInactive(lastShareTimestamp, lastActivatedAt, createdAt, now);
      
      // Fresh shares = no grace period check needed = active
      expect(result.shouldMarkInactive).toBe(false);
      expect(result.daysRemaining).toBeUndefined();
    });

    it('should handle reactivated user getting fresh grace period', () => {
      const lastShareTimestamp = Math.floor((now - 10 * 24 * 60 * 60 * 1000) / 1000); // 10 days ago (stale)
      const lastActivatedAt = new Date(now - 1 * 60 * 60 * 1000); // 1 hour ago (just reset)
      const createdAt = new Date(now - 100 * 24 * 60 * 60 * 1000);
      
      const result = shouldMarkUserInactive(lastShareTimestamp, lastActivatedAt, createdAt, now);
      
      // Fresh lastActivatedAt gives new grace period despite stale shares
      expect(result.shouldMarkInactive).toBe(false);
      expect(result.daysRemaining).toBe(7); // Full 7 days remaining
    });

    it('should handle null lastActivatedAt falling back to fresh createdAt', () => {
      const lastShareTimestamp = Math.floor((now - 10 * 24 * 60 * 60 * 1000) / 1000); // 10 days ago
      const lastActivatedAt = null;
      const createdAt = new Date(now - 2 * 24 * 60 * 60 * 1000); // 2 days ago (fresh)
      
      const result = shouldMarkUserInactive(lastShareTimestamp, lastActivatedAt, createdAt, now);
      
      // Should use createdAt as fallback, which is within grace period
      expect(result.shouldMarkInactive).toBe(false);
      expect(result.daysRemaining).toBeGreaterThan(0);
    });

    it('should mark inactive when both thresholds exceeded', () => {
      const lastShareTimestamp = Math.floor((now - 10 * 24 * 60 * 60 * 1000) / 1000); // 10 days ago
      const lastActivatedAt = new Date(now - 10 * 24 * 60 * 60 * 1000); // 10 days ago
      const createdAt = new Date(now - 100 * 24 * 60 * 60 * 1000);
      
      const result = shouldMarkUserInactive(lastShareTimestamp, lastActivatedAt, createdAt, now);
      
      // Both thresholds exceeded = mark inactive
      expect(result.shouldMarkInactive).toBe(true);
    });
  });
});
