#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

function main() {
  const base = process.cwd();
  const pnpmDir = path.join(base, 'node_modules', '.pnpm');
  if (!fs.existsSync(pnpmDir)) {
    console.log('checkPnpmLinks: no .pnpm directory found; nothing to do.');
    process.exit(0);
  }

  let missing = 0;
  const entries = fs.readdirSync(pnpmDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const nested = path.join(pnpmDir, entry.name, 'node_modules');
    if (!fs.existsSync(nested)) continue;
    const pkgs = fs.readdirSync(nested, { withFileTypes: true });
    for (const pkg of pkgs) {
      if (!pkg.isDirectory()) continue;
      if (pkg.name.startsWith('@')) {
        const scope = path.join(nested, pkg.name);
        const scoped = fs.readdirSync(scope, { withFileTypes: true });
        for (const s of scoped) {
          if (!s.isDirectory()) continue;
          const topPath = path.join(base, 'node_modules', pkg.name, s.name);
          if (!fs.existsSync(topPath)) missing++;
        }
      } else {
        const topPath = path.join(base, 'node_modules', pkg.name);
        if (!fs.existsSync(topPath)) missing++;
      }
    }
  }

  if (missing > 0) {
    console.error(`checkPnpmLinks: detected approx ${missing} missing top-level links.`);
    console.error('Run `npm run fix-pnpm-links` or set FIX_PNPM_LINKS=1 in your environment to auto-create links during postinstall.');
    process.exit(1);
  }

  console.log('checkPnpmLinks: all top-level links present.');
  process.exit(0);
}

if (require.main === module) main();
