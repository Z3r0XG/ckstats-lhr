import 'reflect-metadata';

import * as apiModule from '../../lib/api';

// Invoke the real /api/users/[address] GET handler with the data layer mocked. validateBitcoinAddress
// and serializeData run for real; only the DB-backed fetches are stubbed.
const VALID = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa'; // valid mainnet P2PKH (genesis address)

beforeEach(() => {
  jest.restoreAllMocks();
  apiModule.cacheDeletePrefix(''); // clear the real getCached store between tests
});

// The real getCached is used (cleared in beforeEach) so a cached 404 vs a thrown one is distinguishable.
function mockDeps() {
  jest.spyOn(apiModule, 'getLatestPoolStats').mockResolvedValue({} as never);
  jest
    .spyOn(apiModule, 'getUserHistoricalStats')
    .mockResolvedValue([] as never);
}

const reqFor = (addr: string) =>
  ({ url: `http://localhost/api/users/${addr}` }) as never;
const ctxFor = (addr: string) => ({ params: { address: addr } }) as never;

test('400 on an invalid address (before any DB work)', async () => {
  mockDeps();
  const { GET } = await import('../../app/api/users/[address]/route');
  const res = (await GET(
    reqFor('not-a-valid-address'),
    ctxFor('not-a-valid-address')
  )) as Response;
  expect(res.status).toBe(400);
});

test('200 with payload when the user exists', async () => {
  mockDeps();
  jest
    .spyOn(apiModule, 'getUserWithWorkersAndStats')
    .mockResolvedValue({ address: VALID, workers: [], stats: [] } as never);

  const { GET } = await import('../../app/api/users/[address]/route');
  const res = (await GET(reqFor(VALID), ctxFor(VALID))) as Response;

  expect(res.status).toBe(200);
  expect(res.headers.get('content-type')).toContain('application/json');
  const body = await res.json();
  expect(body.user.address).toBe(VALID);
});

test('404 when not found — and the 404 is NOT cached (recovers once the user appears)', async () => {
  mockDeps();
  jest
    .spyOn(apiModule, 'getUserWithWorkersAndStats')
    .mockResolvedValueOnce(null as never) // first request: user not there yet
    .mockResolvedValue({ address: VALID, workers: [], stats: [] } as never); // then they appear

  const { GET } = await import('../../app/api/users/[address]/route');

  const first = (await GET(reqFor(VALID), ctxFor(VALID))) as Response;
  expect(first.status).toBe(404);

  const second = (await GET(reqFor(VALID), ctxFor(VALID))) as Response;
  expect(second.status).toBe(200); // would still be 404 if the null had been cached
});
