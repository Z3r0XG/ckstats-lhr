import 'reflect-metadata';

// We'll mock the DB module and the snapshot helper to avoid adding sqlite deps.
import * as dbModule from '../../lib/db';
import * as apiModule from '../../lib/api';

beforeEach(() => {
  jest.restoreAllMocks();
});

test('snapshot GET returns 200 and Last-Modified, then 304 with matching If-Modified-Since (mocked)', async () => {
  // Fake timestamps
  const tsIso = '2025-11-25T08:00:00.000Z';
  const tsMs = Date.parse(tsIso);

  // Mock getDb to return minimal repository implementations used by the route
  const fakeQb = () => ({
    select() { return this; },
    where() { return this; },
    async getRawOne() { return { maxTs: tsIso, maxW: tsIso }; }
  });

  const fakeDb: any = {
    getRepository(entity: any) {
      // user repository
      if (entity && entity.name === 'User') {
        return {
          findOne: async ({ where, select }: any) => ({ updatedAt: tsIso }),
        };
      }
      // userstats repo
      if (entity && entity.name === 'UserStats') {
        return { createQueryBuilder: fakeQb };
      }
      // worker repo
      if (entity && (entity.name === 'Worker' || entity === 'worker')) {
        return { createQueryBuilder: fakeQb };
      }
      return { createQueryBuilder: fakeQb };
    }
  };

  jest.spyOn(dbModule, 'getDb').mockImplementation(async () => fakeDb as any);

  // Mock the heavy helper to return a stable snapshot object.
  const snapshot = {
    address: 'mockaddr',
    createdAt: tsIso,
    updatedAt: tsIso,
    isActive: true,
    isPublic: false,
    workers: [],
    stats: [],
  };
  jest.spyOn(apiModule, 'getUserWithWorkersAndStats').mockResolvedValue(snapshot as any);

  // Import handler after mocks are in place
  const { GET } = await import('../../app/api/users/snapshot/route');

  const req: any = {
    nextUrl: new URL('http://localhost/?address=mockaddr'),
    headers: { get: (_: string) => null },
  };

  const res1: any = await GET(req);
  expect(res1.status).toBe(200);
  const lm = res1.headers.get('Last-Modified');
  expect(lm).toBeTruthy();

  // If-Modified-Since equal to Last-Modified should produce 304
  const req304: any = {
    nextUrl: new URL('http://localhost/?address=mockaddr'),
    headers: { get: (_: string) => lm },
  };
  const res2: any = await GET(req304);
  expect(res2.status).toBe(304);
});
