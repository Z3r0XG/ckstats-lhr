import { getCached, cacheDelete, cacheDeletePrefix } from '../../lib/api';

describe('in-memory cache helpers', () => {
  beforeEach(() => {
    jest.useRealTimers();
    jest.spyOn(global.Math, 'random').mockRestore();
  });

  test('getCached caches result and avoids reloading', async () => {
    const loader = jest.fn(async () => ({ value: 'ok' }));

    const a = await getCached('test:key1', 5, loader);
    const b = await getCached('test:key1', 5, loader);

    expect(a).toEqual({ value: 'ok' });
    expect(b).toEqual({ value: 'ok' });
    expect(loader).toHaveBeenCalledTimes(1);
  });

  test('cache expires after TTL and loader is called again', async () => {
    jest.spyOn(global.Math, 'random').mockImplementation(() => 0.5);

    jest.useFakeTimers();
    const start = Date.now();
    jest.setSystemTime(start);

    const loader = jest.fn(async () => ({ t: Date.now() }));

    const first = await getCached('test:key2', 1, loader); // 1s ttl
    expect(loader).toHaveBeenCalledTimes(1);

    jest.setSystemTime(start + 1500);

    const second = await getCached('test:key2', 1, loader);
    expect(loader).toHaveBeenCalledTimes(2);
    expect(second).not.toEqual(first);

    jest.useRealTimers();
    (global.Math.random as jest.Mock).mockRestore();
  });

  test('cacheDelete removes a single key', async () => {
    const loader = jest.fn(async () => ({ v: Math.random() }));

    const a = await getCached('test:key3', 10, loader);
    expect(loader).toHaveBeenCalledTimes(1);

    cacheDelete('test:key3');

    const b = await getCached('test:key3', 10, loader);
    expect(loader).toHaveBeenCalledTimes(2);
    expect(b).not.toEqual(a);
  });

  test('cacheDeletePrefix removes multiple keys with given prefix', async () => {
    const loaderA = jest.fn(async () => 'A');
    const loaderB = jest.fn(async () => 'B');

    await getCached('pref:one', 10, loaderA);
    await getCached('pref:two', 10, loaderB);

    expect(loaderA).toHaveBeenCalledTimes(1);
    expect(loaderB).toHaveBeenCalledTimes(1);

    cacheDeletePrefix('pref:');

    await getCached('pref:one', 10, loaderA);
    await getCached('pref:two', 10, loaderB);

    expect(loaderA).toHaveBeenCalledTimes(2);
    expect(loaderB).toHaveBeenCalledTimes(2);
  });
});
