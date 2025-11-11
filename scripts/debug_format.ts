import 'dotenv/config';
import { getUserWithWorkersAndStats } from '../lib/api';
import { formatHashrate } from '../utils/helpers';

async function main() {
  const addr = process.argv[2];
  if (!addr) {
    console.error('Usage: ts-node scripts/debug_format.ts <address>');
    process.exit(2);
  }

  const user = await getUserWithWorkersAndStats(addr);
  if (!user) {
    console.error('User not found');
    process.exit(1);
  }

  console.log('User:', user.address, 'workers:', (user.workers || []).length);
  for (const w of user.workers || []) {
    const hr5m = w.hashrate5m ?? '0';
    const hr1hr = w.hashrate1hr ?? '0';
    const hr1d = w.hashrate1d ?? '0';
    console.log('Worker:', w.name);
    console.log('  raw 5m:', hr5m, 'formatted:', formatHashrate(hr5m, true));
    console.log('  raw 1hr:', hr1hr, 'formatted:', formatHashrate(hr1hr, true));
    console.log('  raw 1d:', hr1d, 'formatted:', formatHashrate(hr1d, true));
  }
}

main().catch(err => { console.error(err); process.exit(1); });
