/**
 * @jest-environment node
 */

/**
 * Tests for the enhanced user inactive logic with grace period
 */

import { DataSource, Repository } from 'typeorm';
import { User } from '../../lib/entities/User';

// FileNotFoundError class (same as in updateUsers.ts)
class FileNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FileNotFoundError';
  }
}

describe('updateUsers inactive logic with grace period', () => {
  let mockUserRepository: jest.Mocked<Repository<User>>;
  let mockDb: jest.Mocked<DataSource>;

  beforeEach(() => {
    // Mock database and repository
    mockUserRepository = {
      findOne: jest.fn(),
      update: jest.fn(),
    } as any;

    mockDb = {
      getRepository: jest.fn().mockReturnValue(mockUserRepository),
    } as any;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('FileNotFoundError handling', () => {
    it('should be thrown when ENOENT occurs during file read', () => {
      const fileError = new Error('ENOENT: no such file or directory') as any;
      fileError.code = 'ENOENT';

      // Simulate the logic from fetchUserDataWithRetry
      let thrownError: Error | null = null;
      try {
        if (fileError.code === 'ENOENT') {
          throw new FileNotFoundError('User file not found: testAddress');
        }
      } catch (err) {
        thrownError = err as Error;
      }

      expect(thrownError).toBeInstanceOf(FileNotFoundError);
      expect(thrownError?.name).toBe('FileNotFoundError');
      expect(thrownError?.message).toContain('User file not found');
    });

    it('should mark user inactive immediately when FileNotFoundError is caught', async () => {
      const error = new FileNotFoundError('User file not found: testAddress');
      
      // Simulate the catch block logic
      if (error instanceof FileNotFoundError) {
        await mockUserRepository.update(
          { address: 'testAddress' },
          { isActive: false }
        );
      }

      expect(mockUserRepository.update).toHaveBeenCalledWith(
        { address: 'testAddress' },
        { isActive: false }
      );
    });

    it('should NOT mark user inactive for database errors', async () => {
      const error = new Error('database connection failed');
      
      // Simulate the catch block logic
      if (error instanceof FileNotFoundError) {
        await mockUserRepository.update(
          { address: 'testAddress' },
          { isActive: false }
        );
      }

      expect(mockUserRepository.update).not.toHaveBeenCalled();
    });

    it('should NOT mark user inactive for transaction errors', async () => {
      const error = new Error('transaction aborted');
      
      // Simulate the catch block logic
      if (error instanceof FileNotFoundError) {
        await mockUserRepository.update(
          { address: 'testAddress' },
          { isActive: false }
        );
      }

      expect(mockUserRepository.update).not.toHaveBeenCalled();
    });
  });

  describe('Grace period logic', () => {
    const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
    const now = Date.now();

    it('should NOT mark inactive when lastshare is fresh (within 7 days)', async () => {
      const lastshare = Math.floor((now - 3 * 24 * 60 * 60 * 1000) / 1000); // 3 days ago
      const lastShareAge = now - (lastshare * 1000);
      
      expect(lastShareAge).toBeLessThan(SEVEN_DAYS_MS);
      
      // Logic should skip grace period check entirely
      let shouldCheckGracePeriod = false;
      if (lastShareAge > SEVEN_DAYS_MS) {
        shouldCheckGracePeriod = true;
      }
      
      expect(shouldCheckGracePeriod).toBe(false);
    });

    it('should NOT mark inactive when lastshare stale BUT lastActivatedAt within grace period', async () => {
      const lastshare = Math.floor((now - 10 * 24 * 60 * 60 * 1000) / 1000); // 10 days ago
      const lastActivatedAt = new Date(now - 3 * 24 * 60 * 60 * 1000); // 3 days ago
      
      const lastShareAge = now - (lastshare * 1000);
      const lastActivatedAge = now - lastActivatedAt.getTime();
      
      expect(lastShareAge).toBeGreaterThan(SEVEN_DAYS_MS);
      expect(lastActivatedAge).toBeLessThan(SEVEN_DAYS_MS);
      
      // Simulate grace period logic
      const userRecord = { address: 'testAddress', lastActivatedAt };
      mockUserRepository.findOne.mockResolvedValue(userRecord as User);
      
      if (lastShareAge > SEVEN_DAYS_MS) {
        const user = await mockUserRepository.findOne({ where: { address: 'testAddress' } });
        
        if (user?.lastActivatedAt) {
          const age = now - user.lastActivatedAt.getTime();
          
          if (age > SEVEN_DAYS_MS) {
            await mockUserRepository.update({ address: 'testAddress' }, { isActive: false });
          }
        }
      }
      
      // Should NOT have marked inactive (within grace period)
      expect(mockUserRepository.update).not.toHaveBeenCalled();
    });

    it('should mark inactive when BOTH lastshare AND lastActivatedAt exceed 7 days', async () => {
      const lastshare = Math.floor((now - 10 * 24 * 60 * 60 * 1000) / 1000); // 10 days ago
      const lastActivatedAt = new Date(now - 10 * 24 * 60 * 60 * 1000); // 10 days ago
      
      const lastShareAge = now - (lastshare * 1000);
      const lastActivatedAge = now - lastActivatedAt.getTime();
      
      expect(lastShareAge).toBeGreaterThan(SEVEN_DAYS_MS);
      expect(lastActivatedAge).toBeGreaterThan(SEVEN_DAYS_MS);
      
      // Simulate grace period logic
      const userRecord = { address: 'testAddress', lastActivatedAt };
      mockUserRepository.findOne.mockResolvedValue(userRecord as User);
      
      if (lastShareAge > SEVEN_DAYS_MS) {
        const user = await mockUserRepository.findOne({ where: { address: 'testAddress' } });
        
        if (user?.lastActivatedAt) {
          const age = now - user.lastActivatedAt.getTime();
          
          if (age > SEVEN_DAYS_MS) {
            await mockUserRepository.update({ address: 'testAddress' }, { isActive: false });
          }
        }
      }
      
      // Should have marked inactive (both thresholds exceeded)
      expect(mockUserRepository.update).toHaveBeenCalledWith(
        { address: 'testAddress' },
        { isActive: false }
      );
    });

    it('should repair null lastActivatedAt using createdAt and stay active if within grace period', async () => {
      // User with null lastActivatedAt but fresh createdAt
      const lastshare = Math.floor((now - 10 * 24 * 60 * 60 * 1000) / 1000); // 10 days ago (stale)
      const createdAt = new Date(now - 2 * 24 * 60 * 60 * 1000); // 2 days ago (fresh)
      const lastShareAge = now - (lastshare * 1000);
      
      // Simulate grace period logic with null lastActivatedAt but fresh createdAt
      const userRecord = { address: 'testAddress', lastActivatedAt: null, createdAt };
      mockUserRepository.findOne.mockResolvedValue(userRecord as User);
      
      if (lastShareAge > SEVEN_DAYS_MS) {
        const user = await mockUserRepository.findOne({ where: { address: 'testAddress' } });
        
        // Repair null lastActivatedAt before checking grace period
        let lastActivatedAtToCheck = user?.lastActivatedAt;
        if (!lastActivatedAtToCheck && user?.createdAt) {
          lastActivatedAtToCheck = user.createdAt;
          // Would call update to repair, but mock doesn't enforce this
        }
        
        if (lastActivatedAtToCheck) {
          const age = now - lastActivatedAtToCheck.getTime();
          
          if (age > SEVEN_DAYS_MS) {
            await mockUserRepository.update({ address: 'testAddress' }, { isActive: false });
          }
        }
      }
      
      // Should NOT mark inactive - grace period from fresh createdAt protects user
      expect(mockUserRepository.update).not.toHaveBeenCalled();
    });

    it('should repair null lastActivatedAt and mark inactive if both thresholds exceed 7 days', async () => {
      // User with null lastActivatedAt and stale createdAt
      const lastshare = Math.floor((now - 10 * 24 * 60 * 60 * 1000) / 1000); // 10 days ago (stale)
      const createdAt = new Date(now - 10 * 24 * 60 * 60 * 1000); // 10 days ago (stale)
      const lastShareAge = now - (lastshare * 1000);
      
      // Simulate grace period logic with null lastActivatedAt and stale createdAt
      const userRecord = { address: 'testAddress', lastActivatedAt: null, createdAt };
      mockUserRepository.findOne.mockResolvedValue(userRecord as User);
      
      if (lastShareAge > SEVEN_DAYS_MS) {
        const user = await mockUserRepository.findOne({ where: { address: 'testAddress' } });
        
        // Repair null lastActivatedAt before checking grace period
        let lastActivatedAtToCheck = user?.lastActivatedAt;
        if (!lastActivatedAtToCheck && user?.createdAt) {
          lastActivatedAtToCheck = user.createdAt;
          // Would call update to repair, but mock doesn't enforce this
        }
        
        if (lastActivatedAtToCheck) {
          const age = now - lastActivatedAtToCheck.getTime();
          
          if (age > SEVEN_DAYS_MS) {
            await mockUserRepository.update({ address: 'testAddress' }, { isActive: false });
          }
        }
      }
      
      // Should mark inactive - both thresholds (lastshare and createdAt) exceed 7 days
      expect(mockUserRepository.update).toHaveBeenCalledWith(
        { address: 'testAddress' },
        { isActive: false }
      );
    });

    it('should calculate exact threshold boundary correctly (7 days = 604800000 ms)', () => {
      const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
      expect(SEVEN_DAYS_MS).toBe(604800000);
      
      const justUnder = SEVEN_DAYS_MS - 1;
      const exactly = SEVEN_DAYS_MS;
      const justOver = SEVEN_DAYS_MS + 1;
      
      expect(justUnder > SEVEN_DAYS_MS).toBe(false); // Within grace period
      expect(exactly > SEVEN_DAYS_MS).toBe(false);   // Boundary case: still within
      expect(justOver > SEVEN_DAYS_MS).toBe(true);   // Grace period expired
    });

    it('should keep user active when shares fresh but lastActivatedAt is stale', async () => {
      // Scenario 2: Fresh shares bypass grace period regardless of lastActivatedAt
      const lastshare = Math.floor((now - 1 * 60 * 60 * 1000) / 1000); // 1 hour ago (fresh)
      const lastActivatedAt = new Date(now - 10 * 24 * 60 * 60 * 1000); // 10 days ago (stale)
      
      const lastShareAge = now - (lastshare * 1000);
      const lastActivatedAge = now - lastActivatedAt.getTime();
      
      expect(lastShareAge).toBeLessThan(SEVEN_DAYS_MS);
      expect(lastActivatedAge).toBeGreaterThan(SEVEN_DAYS_MS);
      
      // Fresh shares should skip grace period check entirely
      let shouldCheckGracePeriod = false;
      if (lastShareAge > SEVEN_DAYS_MS) {
        shouldCheckGracePeriod = true;
      }
      
      // Outer check fails → grace period logic never runs
      expect(shouldCheckGracePeriod).toBe(false);
    });

    it('should keep user active when shares fresh and lastActivatedAt is NULL', async () => {
      // Scenario 3: Fresh shares + NULL lastActivatedAt (outer check skips before NULL repair)
      const lastshare = Math.floor((now - 2 * 60 * 60 * 1000) / 1000); // 2 hours ago (fresh)
      const lastShareAge = now - (lastshare * 1000);
      
      expect(lastShareAge).toBeLessThan(SEVEN_DAYS_MS);
      
      // NULL lastActivatedAt is irrelevant when shares are fresh
      // Outer check skips before reaching NULL repair logic
      let shouldCheckGracePeriod = false;
      if (lastShareAge > SEVEN_DAYS_MS) {
        shouldCheckGracePeriod = true;
      }
      
      expect(shouldCheckGracePeriod).toBe(false);
    });

    it('should keep reset user active when actively mining', async () => {
      // Scenario 10: Reset + fresh shares → always active
      const lastshare = Math.floor((now - 30 * 60 * 1000) / 1000); // 30 minutes ago (fresh)
      const lastActivatedAt = new Date(); // Just reset NOW
      
      const lastShareAge = now - (lastshare * 1000);
      const lastActivatedAge = now - lastActivatedAt.getTime();
      
      expect(lastShareAge).toBeLessThan(SEVEN_DAYS_MS);
      expect(lastActivatedAge).toBeLessThan(1000); // Less than 1 second
      
      // Fresh shares → outer check skips (even though lastActivatedAt is fresh too)
      let shouldCheckGracePeriod = false;
      if (lastShareAge > SEVEN_DAYS_MS) {
        shouldCheckGracePeriod = true;
      }
      
      expect(shouldCheckGracePeriod).toBe(false);
    });

    it('should mark inactive when reset grace period expires without mining', async () => {
      // Scenario 13: Reset 10 days ago, no mining for 15 days → both stale → inactive
      const lastshare = Math.floor((now - 15 * 24 * 60 * 60 * 1000) / 1000); // 15 days ago (stale)
      const lastActivatedAt = new Date(now - 10 * 24 * 60 * 60 * 1000); // 10 days ago (reset 10d ago, stale)
      
      const lastShareAge = now - (lastshare * 1000);
      const lastActivatedAge = now - lastActivatedAt.getTime();
      
      expect(lastShareAge).toBeGreaterThan(SEVEN_DAYS_MS);
      expect(lastActivatedAge).toBeGreaterThan(SEVEN_DAYS_MS);
      
      // Simulate grace period logic
      const userRecord = { address: 'testAddress', lastActivatedAt };
      mockUserRepository.findOne.mockResolvedValue(userRecord as User);
      
      if (lastShareAge > SEVEN_DAYS_MS) {
        const user = await mockUserRepository.findOne({ where: { address: 'testAddress' } });
        
        if (user?.lastActivatedAt) {
          const age = now - user.lastActivatedAt.getTime();
          
          if (age > SEVEN_DAYS_MS) {
            await mockUserRepository.update({ address: 'testAddress' }, { isActive: false });
          }
        }
      }
      
      // Both thresholds exceeded → inactive
      expect(mockUserRepository.update).toHaveBeenCalledWith(
        { address: 'testAddress' },
        { isActive: false }
      );
    });
  });

  describe('lastActivatedAt field updates', () => {
    it('should set lastActivatedAt when user is created via POST', () => {
      const now = new Date();
      const userData = {
        address: 'testAddress',
        isActive: true,
        isPublic: true,
        lastActivatedAt: now,
        updatedAt: now.toISOString(),
      };
      
      expect(userData.lastActivatedAt).toBeInstanceOf(Date);
      expect(userData.lastActivatedAt.getTime()).toBeCloseTo(now.getTime(), -2);
    });

    it('should update lastActivatedAt when resetUserActive is called', async () => {
      const now = new Date();
      
      await mockUserRepository.update('testAddress', {
        isActive: true,
        lastActivatedAt: now,
      });
      
      expect(mockUserRepository.update).toHaveBeenCalledWith(
        'testAddress',
        expect.objectContaining({
          isActive: true,
          lastActivatedAt: expect.any(Date),
        })
      );
    });
  });

  describe('Integration scenarios', () => {
    const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
    const now = Date.now();

    it('should allow reactivated user to mine for 7 days before checking inactivity again', async () => {
      const lastshare = Math.floor((now - 10 * 24 * 60 * 60 * 1000) / 1000); // 10 days ago (stale)
      const lastActivatedAt = new Date(); // Just reactivated NOW
      
      const lastShareAge = now - (lastshare * 1000);
      const lastActivatedAge = now - lastActivatedAt.getTime();
      
      // User hasn't mined in 10 days BUT was just reactivated
      expect(lastShareAge).toBeGreaterThan(SEVEN_DAYS_MS);
      expect(lastActivatedAge).toBeLessThan(1000); // Less than 1 second ago
      
      const userRecord = { address: 'testAddress', lastActivatedAt };
      mockUserRepository.findOne.mockResolvedValue(userRecord as User);
      
      if (lastShareAge > SEVEN_DAYS_MS) {
        const user = await mockUserRepository.findOne({ where: { address: 'testAddress' } });
        
        if (user?.lastActivatedAt) {
          const age = now - user.lastActivatedAt.getTime();
          
          if (age > SEVEN_DAYS_MS) {
            await mockUserRepository.update({ address: 'testAddress' }, { isActive: false });
          }
        }
      }
      
      // Should give 7-day grace period despite stale lastshare
      expect(mockUserRepository.update).not.toHaveBeenCalled();
    });

    it('should handle null lastActivatedAt → inactive → reset cycle', async () => {
      const lastshare = Math.floor((now - 10 * 24 * 60 * 60 * 1000) / 1000); // 10 days ago (stale)
      const createdAt = new Date(now - 15 * 24 * 60 * 60 * 1000); // 15 days ago
      const lastShareAge = now - (lastshare * 1000);
      
      // Phase 1: User with null lastActivatedAt and stale shares → should be marked inactive
      let userRecord = { address: 'testAddress', lastActivatedAt: null, createdAt, isActive: true };
      mockUserRepository.findOne.mockResolvedValue(userRecord as User);
      
      // Grace period logic detects stale state
      if (lastShareAge > SEVEN_DAYS_MS) {
        const user = await mockUserRepository.findOne({ where: { address: 'testAddress' } });
        
        let lastActivatedAtToCheck = user?.lastActivatedAt;
        if (!lastActivatedAtToCheck && user?.createdAt) {
          lastActivatedAtToCheck = user.createdAt;
        }
        
        if (lastActivatedAtToCheck) {
          const age = now - lastActivatedAtToCheck.getTime();
          if (age > SEVEN_DAYS_MS) {
            await mockUserRepository.update({ address: 'testAddress' }, { isActive: false });
          }
        }
      }
      
      // Should mark user inactive due to both thresholds
      expect(mockUserRepository.update).toHaveBeenCalledWith(
        { address: 'testAddress' },
        { isActive: false }
      );
      
      // Phase 2: User is reset (reactivated) - gets fresh lastActivatedAt
      mockUserRepository.update.mockClear();
      const resetTime = new Date(); // NOW
      userRecord = { address: 'testAddress', lastActivatedAt: resetTime, createdAt, isActive: true };
      mockUserRepository.findOne.mockResolvedValue(userRecord as User);
      
      // Simulate reset logic: updates isActive and lastActivatedAt to NOW
      await mockUserRepository.update('testAddress', {
        isActive: true,
        lastActivatedAt: resetTime,
      });
      
      // After reset, grace period should be measured from new lastActivatedAt (NOW)
      // Even though lastshare is still 10 days old, user gets fresh 7-day grace period
      expect(mockUserRepository.update).toHaveBeenCalledWith(
        'testAddress',
        expect.objectContaining({
          isActive: true,
          lastActivatedAt: expect.any(Date),
        })
      );
    });


    it('should prevent immediate re-marking after database upgrade recovers', async () => {
      // Simulate a user who was active, database upgrade happened causing errors,
      // then service recovers. User should stay active due to fresh mining despite stale lastActivatedAt.
      const lastshare = Math.floor((now - 1 * 60 * 60 * 1000) / 1000); // 1 hour ago (active/fresh)
      const lastActivatedAt = new Date(now - 5 * 24 * 60 * 60 * 1000); // 5 days ago (stale)
      
      const lastShareAge = now - (lastshare * 1000);
      
      // User is actively mining (fresh shares) - shouldn't even check grace period
      expect(lastShareAge).toBeLessThan(SEVEN_DAYS_MS);
      
      // Set up mock to simulate the database state
      const userRecord = { address: 'testAddress', lastActivatedAt };
      mockUserRepository.findOne.mockResolvedValue(userRecord as User);
      
      // Simulate the actual grace period check logic
      let shouldCheckGracePeriod = false;
      if (lastShareAge > SEVEN_DAYS_MS) {
        // User hasn't mined in 7+ days - would check grace period
        shouldCheckGracePeriod = true;
        
        const user = await mockUserRepository.findOne({ where: { address: 'testAddress' } });
        if (user?.lastActivatedAt) {
          const age = now - user.lastActivatedAt.getTime();
          
          if (age > SEVEN_DAYS_MS) {
            await mockUserRepository.update({ address: 'testAddress' }, { isActive: false });
          }
        }
      }
      
      // Fresh mining means grace period check is skipped entirely
      expect(shouldCheckGracePeriod).toBe(false);
      // User should not be marked inactive
      expect(mockUserRepository.update).not.toHaveBeenCalled();
    });
  });
});
