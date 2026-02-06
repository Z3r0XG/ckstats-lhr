import { updateSingleUser } from '../../lib/api';
import * as dbModule from '../../lib/db';
import { readJsonStable } from '../../utils/readFileStable';

jest.mock('../../utils/readFileStable', () => ({
  readJsonStable: jest.fn(),
}));

const mockUserData = {
  authorised: true,
  lastshare: 1690000000,
  workers: 2,
  shares: '123456789012345',
  bestshare: '1.23',
  bestever: '4.45352',
  hashrate1m: '1.2K',
  hashrate5m: '1.0K',
  hashrate1hr: '900',
  hashrate1d: '800',
  hashrate7d: '700',
  worker: [
    {
      workername: 'user.worker1',
      lastshare: 1690000000,
      shares: '100',
      bestshare: '0.12',
      bestever: '0.5',
      hashrate1m: '0.5',
      hashrate5m: '0.4',
      hashrate1hr: '0.3',
      hashrate1d: '0.2',
      hashrate7d: '0.1',
    },
  ],
};

describe('updateSingleUser local-file fallback', () => {
  let tmpDir: string;
  beforeEach(async () => {
    // Simulate fetch rejecting with an error whose cause.code == 'ERR_INVALID_URL'
    (global as any).fetch = jest
      .fn()
      .mockRejectedValue(Object.assign(new Error('invalid'), { cause: { code: 'ERR_INVALID_URL' } }));

    (readJsonStable as jest.Mock).mockResolvedValue(mockUserData);

    // Create a temporary API_URL directory with a users/<address> file so realpathSync won't throw
    const os = await import('os');
    const path = await import('path');
    const fs = await import('fs/promises');
    tmpDir = path.join(os.tmpdir(), `ckstats-api-${Date.now()}`);
    await fs.mkdir(path.join(tmpDir, 'users'), { recursive: true });
    await fs.writeFile(path.join(tmpDir, 'users', 'someaddress'), JSON.stringify(mockUserData));
    process.env.API_URL = tmpDir;

    const fakeUserRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      insert: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
      save: jest.fn().mockResolvedValue({}),
    };

    const fakeUserStatsRepo = {
      create: jest.fn((obj) => obj),
      save: jest.fn().mockResolvedValue({}),
    };

    const fakeWorkerRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      insert: jest.fn().mockResolvedValue({}),
      save: jest.fn().mockResolvedValue({}),
    };

    const manager = {
      getRepository: (entity: any) => {
        const name = entity && entity.name ? entity.name : entity;
        if (String(name).includes('UserStats')) return fakeUserStatsRepo;
        if (String(name).includes('Worker')) return fakeWorkerRepo;
        if (String(name).includes('User')) return fakeUserRepo;
        return {};
      },
    };

    jest.spyOn(dbModule, 'getDb').mockResolvedValue({
      transaction: async (cb: any) => cb(manager),
    } as any);
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    delete (global as any).fetch;
    delete process.env.API_URL;
    if (tmpDir) {
      const fs = await import('fs/promises');
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it('falls back to local JSON read when fetch throws ERR_INVALID_URL', async () => {
    await expect(updateSingleUser('someaddress')).resolves.not.toThrow();
    expect(readJsonStable).toHaveBeenCalled();
  });
});
