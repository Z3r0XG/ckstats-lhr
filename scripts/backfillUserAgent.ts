import 'dotenv/config';
import path from 'path';
import fs from 'fs/promises';
import { getDb } from '../lib/db';
import { Worker } from '../lib/entities/Worker';

function normalizeUa(raw: string): string {
  const s = String(raw ?? '').trim();
  if (!s) return '';
  const token = s.split('/')[0].split(' ')[0];
  return token.replace(/[^\x20-\x7E]/g, '').slice(0, 64);
}

export async function main(opts?: { dryRun?: boolean }) {
  const dryRun = opts?.dryRun === true || process.argv.includes('--dry-run') || process.argv.includes('-n');
  const logDir = process.env.CKPOOL_USER_LOG_DIR || '/var/log/ckpool-lhr/users';
  console.log('Backfill userAgent from logs in', logDir, dryRun ? '(dry-run mode)' : '');

  let files: string[];
  try {
    files = await fs.readdir(logDir);
  } catch (err: any) {
    console.error('Failed to read log dir:', err && err.message ? err.message : err);
    process.exit(2);
  }

  const db = await getDb();
  const repo = db.getRepository(Worker);
  let updated = 0;
  let skipped = 0;
  let wouldUpdate = 0;
  for (const f of files) {
    const filePath = path.join(logDir, f);
    let raw: string;
    try {
      raw = await fs.readFile(filePath, 'utf-8');
    } catch (err) {
      console.error('Failed to read file', filePath, err);
      continue;
    }

    let data: any;
    try {
      data = JSON.parse(raw);
    } catch (err) {
      console.error('Invalid JSON in', filePath);
      continue;
    }

    const address = path.basename(f);
    if (!data?.worker || !Array.isArray(data.worker)) {
      skipped++;
      continue;
    }

    for (const w of data.worker) {
      try {
        const workerName = String(w.workername ?? '').split('.')[1];
        if (!workerName) continue;
        const rawUa = String(w.useragent ?? '').trim();
        if (!rawUa) continue;
        const token = normalizeUa(rawUa);
        const existing = await repo.findOne({ where: { userAddress: address, name: workerName } });
        if (!existing) continue;
        if (existing.userAgentRaw === rawUa && existing.userAgent === token) {
          skipped++;
          continue;
        }
        if (dryRun) {
          wouldUpdate++;
          console.log(`Would update worker id=${existing.id} addr=${address} name=${workerName} -> userAgent='${token}'`);
        } else {
          await repo.update({ id: existing.id }, { userAgent: token, userAgentRaw: rawUa });
          updated++;
        }
      } catch (err) {
        console.error('Error processing worker in', filePath, err);
      }
    }
  }

  if (dryRun) {
    console.log(`Dry-run complete. Would update: ${wouldUpdate}, Skipped: ${skipped}`);
  } else {
    console.log(`Backfill complete. Updated: ${updated}, Skipped: ${skipped}`);
  }
  process.exit(0);
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Backfill failed:', err);
    process.exit(2);
  });
}
