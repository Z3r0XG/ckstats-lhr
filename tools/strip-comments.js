#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const root = process.cwd();
const exts = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
const skipDirs = new Set(['node_modules', '.next', '.git', 'dist', 'build']);

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (skipDirs.has(e.name)) continue;
      walk(full);
    } else if (e.isFile()) {
      const ext = path.extname(e.name);
      if (!exts.has(ext)) continue;
      processFile(full);
    }
  }
}

function processFile(file) {
  try {
    const s = fs.readFileSync(file, 'utf8');
    // Remove block comments
    let out = s.replace(/\/\*[\s\S]*?\*\//g, '');
    // Remove line comments that start at line or after whitespace
    out = out.replace(/(^|\n)[ \t]*\/\/.*$/gm, '$1');
    if (out !== s) {
      fs.writeFileSync(file, out, 'utf8');
      console.log('Stripped comments:', file);
    }
  } catch (err) {
    console.error('Failed to process', file, err.message);
  }
}

walk(root);
console.log('Comment stripping complete.');
