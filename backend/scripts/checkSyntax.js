#!/usr/bin/env node
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

/**
 * Parses every source file with `node --check`.
 *
 * A stand-in for a linter: the project has no ESLint config, and a syntax gate
 * still catches the class of mistake that would take the whole server down on
 * boot. Cheap enough to run on every push.
 */
const ROOT = path.join(__dirname, '..');
const SKIP = new Set(['node_modules', '.git', 'coverage', 'dist']);

function collect(dir, found = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collect(full, found);
    else if (entry.name.endsWith('.js')) found.push(full);
  }
  return found;
}

const files = collect(ROOT);
const failures = [];

for (const file of files) {
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
  } catch (error) {
    failures.push({ file: path.relative(ROOT, file), message: String(error.stderr || error.message) });
  }
}

if (failures.length) {
  console.error(`\n${failures.length} file(s) failed to parse:\n`);
  failures.forEach((f) => console.error(`  ${f.file}\n${f.message}`));
  process.exit(1);
}

console.log(`Syntax OK: ${files.length} files parsed`);
