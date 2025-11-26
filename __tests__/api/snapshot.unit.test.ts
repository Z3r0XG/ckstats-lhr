import 'reflect-metadata';

import * as dbModule from '../../lib/db';
import * as apiModule from '../../lib/api';

beforeEach(() => {
  jest.restoreAllMocks();
});

test('snapshot GET returns 200 and Last-Modified, then 304 with matching If-Modified-Since (mocked)', async () => {
  const tsIso = '2025-11-25T08:00:00.000Z';
  const tsMs = Date.parse(tsIso);

  const fakeQb = () => ({
    select() { return this; },
    where() { return this; },
    async getRawOne() { return { maxTs: tsIso, maxW: tsIso }; }
  });

  const fakeDb: any = {
    getRepository(entity: any) {
      if (entity && entity.name === 'User') {
        return {
          findOne: async ({ where, select }: any) => ({ updatedAt: tsIso }),
        };
      }
      if (entity && entity.name === 'UserStats') {
        return { createQueryBuilder: fakeQb };
      }
      if (entity && (entity.name === 'Worker' || entity === 'worker')) {
        return { createQueryBuilder: fakeQb };
      }
      return { createQueryBuilder: fakeQb };
    }
  };

  jest.spyOn(dbModule, 'getDb').mockImplementation(async () => fakeDb as any);

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

  const { GET } = await import('../../app/api/users/snapshot/route');

  const req: any = {
    nextUrl: new URL('http://localhost/?address=mockaddr'),
    headers: { get: (_: string) => null },
  };

  const res1: any = await GET(req);
  expect(res1.status).toBe(200);
  const lm = res1.headers.get('Last-Modified');
  expect(lm).toBeTruthy();

  const req304: any = {
    nextUrl: new URL('http://localhost/?address=mockaddr'),
    headers: { get: (_: string) => lm },
  };
  const res2: any = await GET(req304);
  expect(res2.status).toBe(304);
});
