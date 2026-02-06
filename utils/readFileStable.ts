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

  // Retry attempts (0 to retries-2)
  for (let attempt = 0; attempt < retries - 1; attempt++) {
    try {
      return await fs.readFile(filePath, 'utf-8');
    } catch (err: any) {
      // If the file is temporarily missing or being replaced, retry
      if (err && err.code === 'ENOENT') {
        await delay(backoffMs * Math.pow(2, attempt));
        continue;
      }
      throw err; // Non-retryable error
    }
  }

  // Final attempt - let errors propagate
  return await fs.readFile(filePath, 'utf-8');
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

  // Retry attempts (0 to retries-2)
  for (let attempt = 0; attempt < retries - 1; attempt++) {
    try {
      const text = await fs.readFile(filePath, 'utf-8');
      try {
        return JSON.parse(text);
      } catch (parseErr) {
        // JSON parse error likely due to partial write — retry
        await delay(backoffMs * Math.pow(2, attempt));
        continue;
      }
    } catch (err: any) {
      if (err && err.code === 'ENOENT') {
        await delay(backoffMs * Math.pow(2, attempt));
        continue;
      }
      throw err; // Non-retryable error
    }
  }

  // Final attempt - let errors propagate
  const text = await fs.readFile(filePath, 'utf-8');
  return JSON.parse(text);
}
