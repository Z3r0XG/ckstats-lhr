import * as fs from 'fs/promises';
import * as path from 'path';
import os from 'os';
import { readFileStable, readJsonStable } from '../../utils/readFileStable';

const tmpDir = path.join(os.tmpdir(), `ckstats-test-${Date.now()}`);

beforeAll(async () => {
  await fs.mkdir(tmpDir, { recursive: true });
});

afterAll(async () => {
  try {
    await fs.rm(tmpDir, { recursive: true, force: true });
  } catch {}
});

test('readFileStable retries until file appears', async () => {
  const p = path.join(tmpDir, 'delayed.txt');
  setTimeout(async () => {
    await fs.writeFile(p, 'hello');
  }, 100);

  const res = await readFileStable(p, { retries: 10, backoffMs: 20 });
  expect(res).toBe('hello');
});

test('readJsonStable retries on partial JSON', async () => {
  const p = path.join(tmpDir, 'partial.json');
  // Write a partial (invalid) JSON first, then overwrite with valid JSON
  setTimeout(async () => {
    await fs.writeFile(p, '{"a": 1');
    setTimeout(async () => {
      await fs.writeFile(p, '{"a": 1}');
    }, 80);
  }, 20);

  const res = await readJsonStable(p, { retries: 10, backoffMs: 20 });
  expect(res).toEqual({ a: 1 });
});
