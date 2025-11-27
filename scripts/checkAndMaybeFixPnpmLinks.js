#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
const { spawnSync } = require('child_process');
const path = require('path');

const fixer = path.join(__dirname, 'fixPnpmLinks.js');

console.log('Note: links will be created under node_modules/.');

const dry = spawnSync(process.execPath, [fixer], {
  env: { ...process.env, DRY_RUN: '1' },
  encoding: 'utf8',
});

const out = (dry.stdout || '').toString();
const lines = out
  .split(/\r?\n/)
  .map((l) => l.trim())
  .filter(Boolean);
const wouldCreate = lines.filter(
  (l) => l.includes('DRY RUN: WOULD CREATE') || l.includes('WOULD CREATE')
);

if (wouldCreate.length === 0) {
  console.log(
    'checkAndMaybeFixPnpmLinks: no missing top-level links detected.'
  );
  process.exit(0);
}

console.log(
  `checkAndMaybeFixPnpmLinks: detected approx ${wouldCreate.length} missing top-level links.`
);
console.log('Planned link operations (showing up to 20):');
for (let i = 0; i < Math.min(20, wouldCreate.length); i++) {
  console.log('  ' + wouldCreate[i]);
}
if (wouldCreate.length > 20)
  console.log(`  ...and ${wouldCreate.length - 20} more`);

if (process.env.FIX_PNPM_LINKS === '1') {
  console.log('FIX_PNPM_LINKS=1 set; applying fixes now.');
  const r = spawnSync(process.execPath, [fixer], {
    stdio: 'inherit',
    encoding: 'utf8',
  });
  process.exit(r.status || 0);
}

const prompt =
  'Create these top-level links in this repository now? (these will be created under node_modules/ in the current project) (y/N): ';

function ask(question, cb) {
  process.stdout.write(question);
  process.stdin.setEncoding('utf8');
  process.stdin.resume();
  process.stdin.once('data', function (data) {
    process.stdin.pause();
    cb(String(data).trim());
  });
}

ask(prompt, (answer) => {
  const normalized = (answer || '').toLowerCase();
  if (normalized === 'y' || normalized === 'yes') {
    console.log('Running fixPnpmLinks to create top-level links...');
    const res = spawnSync(process.execPath, [fixer], {
      stdio: 'inherit',
      encoding: 'utf8',
    });
    if (res.error) {
      console.error(
        'fixPnpmLinks failed; please run `pnpm run fix-pnpm-links` manually and inspect errors.'
      );
      process.exitCode = 2;
    } else {
      console.log('fixPnpmLinks completed.');
      process.exit(res.status || 0);
    }
  } else {
    console.log('No changes made (user declined).');
    process.exit(0);
  }
});
