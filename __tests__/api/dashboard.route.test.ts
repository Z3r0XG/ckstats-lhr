import 'reflect-metadata';

import * as apiModule from '../../lib/api';
import * as healthModule from '../../lib/poolHealth';

// Invoke the real /api/dashboard GET handler with the data layer mocked, so the route logic
// (existence check, status codes, headers, payload assembly) is exercised for real.
beforeEach(() => {
  jest.restoreAllMocks();
  apiModule.cacheDeletePrefix(''); // clear the real getCached store between tests
});

// Everything the payload builder needs, except getLatestPoolStats (set per test). The real getCached
// is used (cleared in beforeEach) so a cached null vs a thrown null is actually distinguishable.
function mockDeps() {
  jest
    .spyOn(apiModule, 'getHistoricalPoolStats')
    .mockResolvedValue([] as never);
  jest.spyOn(apiModule, 'getTopUserHashrates').mockResolvedValue([] as never);
  jest
    .spyOn(apiModule, 'getTopUserDifficulties')
    .mockResolvedValue([] as never);
  jest.spyOn(apiModule, 'getTopUserLoyalty').mockResolvedValue([] as never);
  jest.spyOn(apiModule, 'getOnlineDevices').mockResolvedValue([] as never);
  jest.spyOn(apiModule, 'getTopBestDiffs').mockResolvedValue([] as never);
  jest
    .spyOn(healthModule, 'getServiceSnapshot')
    .mockReturnValue({ state: 'ok' } as never);
}

const req = () => ({ url: 'http://localhost/api/dashboard' }) as never;

test('returns 200 JSON payload when stats exist', async () => {
  mockDeps();
  jest
    .spyOn(apiModule, 'getLatestPoolStats')
    .mockResolvedValue({ id: 1, timestamp: new Date() } as never);

  const { GET } = await import('../../app/api/dashboard/route');
  const res = (await GET(req())) as Response;

  expect(res.status).toBe(200);
  expect(res.headers.get('content-type')).toContain('application/json');
  const body = await res.json();
  expect(body.version).toBe(1);
  expect(body).toHaveProperty('latestStats');
  expect(body).toHaveProperty('service');
});

test('503 when no stats — and the 503 is NOT cached (recovers once stats appear)', async () => {
  mockDeps();
  jest
    .spyOn(apiModule, 'getLatestPoolStats')
    .mockResolvedValueOnce(null as never) // first request: no stats yet
    .mockResolvedValue({ id: 1, timestamp: new Date() } as never); // then they appear

  const { GET } = await import('../../app/api/dashboard/route');

  const first = (await GET(req())) as Response;
  expect(first.status).toBe(503);

  const second = (await GET(req())) as Response;
  expect(second.status).toBe(200); // would still be 503 if the null had been cached
});

test('debug_error query forces a 500', async () => {
  mockDeps();
  jest
    .spyOn(apiModule, 'getLatestPoolStats')
    .mockResolvedValue({ id: 1, timestamp: new Date() } as never);

  const { GET } = await import('../../app/api/dashboard/route');
  const res = (await GET({
    url: 'http://localhost/api/dashboard?debug_error=true',
  } as never)) as Response;
  expect(res.status).toBe(500);
});
