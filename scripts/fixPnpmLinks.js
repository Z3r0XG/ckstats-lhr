#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('fs');
const path = require('path');
function isWindows() {
  return process.platform === 'win32';
}
function ensureLink(target, linkPath) {
  try {
    if (fs.existsSync(linkPath)) return;
    fs.mkdirSync(path.dirname(linkPath), { recursive: true });
    if (isWindows()) {
      fs.symlinkSync(target, linkPath, 'junction');
    } else {
      fs.symlinkSync(target, linkPath);
    }
    console.log(`Created link: ${linkPath} -> ${target}`);
  } catch (err) {
    console.error(
      `Failed to create link ${linkPath} -> ${target}:`,
      err && err.message ? err.message : err
    );
  }
}
function main() {
  const projectRoot = process.cwd();
  const pnpmDir = path.join(projectRoot, 'node_modules', '.pnpm');
  const topNodeModules = path.join(projectRoot, 'node_modules');
  if (!fs.existsSync(pnpmDir)) {
    console.log('No .pnpm directory found, nothing to do.');
    return;
  }
  try {
    const entries = fs.readdirSync(pnpmDir, { withFileTypes: true });
    let created = 0;
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const nestedNodeModules = path.join(pnpmDir, entry.name, 'node_modules');
      if (!fs.existsSync(nestedNodeModules)) continue;
      const packages = fs.readdirSync(nestedNodeModules, {
        withFileTypes: true,
      });
      for (const pkg of packages) {
        if (!pkg.isDirectory()) continue;
        if (pkg.name.startsWith('@')) {
          const scopePath = path.join(nestedNodeModules, pkg.name);
          const scopedPkgs = fs.readdirSync(scopePath, { withFileTypes: true });
          for (const scoped of scopedPkgs) {
            if (!scoped.isDirectory()) continue;
            const target = path.join(scopePath, scoped.name);
            const linkPath = path.join(topNodeModules, pkg.name, scoped.name);
            ensureLink(target, linkPath);
            created++;
          }
        } else {
          const target = path.join(nestedNodeModules, pkg.name);
          const linkPath = path.join(topNodeModules, pkg.name);
          ensureLink(target, linkPath);
          created++;
        }
      }
    }
    console.log(
      `fixPnpmLinks: completed. Created/ensured links for approx ${created} packages.`
    );
  } catch (err) {
    console.error('fixPnpmLinks: unexpected error', err);
    process.exitCode = 2;
  }
}
if (require.main === module) main();
