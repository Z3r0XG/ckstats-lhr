import * as fs from 'fs/promises';

export interface ReadStableOptions {
  retries?: number;
  backoffMs?: number;
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Read a file with retries for transient errors like ENOENT.
 * Useful when another process deletes-and-recreates files (e.g. ckpool).
 */
export async function readFileStable(
  filePath: string,
  opts: ReadStableOptions = {}
): Promise<string> {
  const retries = opts.retries ?? 5;
  const backoffMs = opts.backoffMs ?? 50;

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return content;
    } catch (err: any) {
      // If the file is temporarily missing or being replaced, retry
      if (err && (err.code === 'ENOENT' || err.code === 'EISDIR')) {
        if (attempt === retries - 1) throw err;
        await delay(backoffMs * Math.pow(2, attempt));
        continue;
      }
      throw err;
    }
  }

  throw new Error('readFileStable: exceeded retries');
}

/**
 * Read and parse JSON with retries on ENOENT or JSON parse failures (partial writes).
 */
export async function readJsonStable(
  filePath: string,
  opts: ReadStableOptions = {}
): Promise<any> {
  const retries = opts.retries ?? 5;
  const backoffMs = opts.backoffMs ?? 50;

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const text = await fs.readFile(filePath, 'utf-8');
      try {
        return JSON.parse(text);
      } catch (parseErr) {
        // JSON parse error likely due to partial write — retry
        if (attempt === retries - 1) throw parseErr;
        await delay(backoffMs * Math.pow(2, attempt));
        continue;
      }
    } catch (err: any) {
      if (err && (err.code === 'ENOENT' || err.code === 'EISDIR')) {
        if (attempt === retries - 1) throw err;
        await delay(backoffMs * Math.pow(2, attempt));
        continue;
      }
      throw err;
    }
  }

  throw new Error('readJsonStable: exceeded retries');
}
