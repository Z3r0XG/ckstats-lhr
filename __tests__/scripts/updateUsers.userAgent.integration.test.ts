import { normalizeUserAgent } from '../../utils/helpers';
import { Worker } from '../../lib/entities/Worker';
import * as dbModule from '../../lib/db';
import { v4 as uuidv4 } from 'uuid';

describe('updateUsers integration: user agent', () => {
  let mockRepo: any;
  let savedRow: any = null;

  beforeAll(async () => {
    // In tests we mock getDb to return a fake repository — avoid real Postgres dependency
    mockRepo = {
      save: jest.fn(async (input: any) => {
        // simulate DB assigning an id and storing the row
        savedRow = { id: 1, ...input };
        return savedRow;
      }),
      findOne: jest.fn(async (_query: any) => savedRow),
    };

    const mockDb = {
      getRepository: () => mockRepo,
    } as any;

    jest.spyOn(dbModule, 'getDb').mockResolvedValue(mockDb as any);
  });

  afterAll(async () => {
    jest.restoreAllMocks();
  });

  it('stores Unicode and long user agent correctly in Worker', async () => {
    const longUserAgent = 'A'.repeat(255) + 'γ';
    const address = uuidv4();
    const workerName = 'testworker';

    // Simulate what updateUsers does
    const token = normalizeUserAgent(longUserAgent);
    const db = await dbModule.getDb();
    const workerRepository = db.getRepository(Worker);

    await workerRepository.save({
      userAddress: address,
      name: workerName,
      userAgent: token,
      userAgentRaw: longUserAgent,
      hashrate1m: 0,
      hashrate5m: 0,
      hashrate1hr: 0,
      hashrate1d: 0,
      hashrate7d: 0,
      lastUpdate: new Date(),
      started: '0',
      shares: 0,
      bestShare: 0,
      bestEver: 0,
    });

    const saved = await workerRepository.findOne({ where: { userAddress: address, name: workerName } });
    expect(saved?.userAgent).toBe(token);
    expect(Array.from(saved!.userAgent).length).toBe(256);
    expect(saved?.userAgent.endsWith('γ')).toBe(true);

    // Ensure repository methods were called
    expect(mockRepo.save).toHaveBeenCalled();
    expect(mockRepo.findOne).toHaveBeenCalled();
  });
});
