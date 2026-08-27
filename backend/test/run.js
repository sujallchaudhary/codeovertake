#!/usr/bin/env node
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

/**
 * Runs every *.test.js in this directory as its own process and aggregates the
 * results.
 *
 * Separate processes matter: each suite boots its own ephemeral MongoDB, and
 * several create the same fixture emails, so sharing one database would collide
 * on the unique index.
 *
 * Usage:
 *   npm test                    # all suites
 *   npm test -- auth            # only suites whose filename matches "auth"
 */
const TEST_DIR = __dirname;
const filter = process.argv[2];

const suites = fs.readdirSync(TEST_DIR)
  .filter((file) => file.endsWith('.test.js'))
  .filter((file) => !filter || file.includes(filter))
  .sort();

if (!suites.length) {
  console.error(filter ? `No test suites match "${filter}"` : 'No test suites found');
  process.exit(1);
}

/**
 * Some suites talk to live platform APIs on purpose, so a transient upstream
 * blip can fail a run that has nothing wrong with it. One retry keeps CI
 * trustworthy without masking a real, reproducible failure.
 */
const RETRIES = Number.parseInt(process.env.TEST_RETRIES ?? '1', 10);

function runSuite(suite) {
  const run = spawnSync(process.execPath, [path.join(TEST_DIR, suite)], {
    stdio: ['inherit', 'pipe', 'inherit'],
    encoding: 'utf8',
    // Live platform APIs can be slow; fail rather than hang CI forever
    timeout: 10 * 60 * 1000,
    env: process.env,
  });

  const stdout = run.stdout || '';
  const marker = stdout.match(/^##SUITE_RESULT (.*)$/m);
  const result = marker
    ? JSON.parse(marker[1])
    // Crashed before it could report (syntax error, boot failure, timeout)
    : { suiteName: suite, passed: 0, failed: 1, crashed: true };

  return { result, stdout, status: run.status };
}

const started = Date.now();
const results = [];
let exitCode = 0;

for (const suite of suites) {
  let attempt = runSuite(suite);

  for (let retry = 1; retry <= RETRIES && attempt.status !== 0; retry += 1) {
    console.log(
      `\n\x1b[33m↻ ${suite} failed, retrying (${retry}/${RETRIES}) `
      + 'in case an upstream API blipped\x1b[0m',
    );
    attempt = runSuite(suite);
  }

  // Stream the transcript through, minus the machine-readable marker line
  console.log(attempt.stdout.replace(/^##SUITE_RESULT .*$/gm, '').replace(/\n{3,}/g, '\n\n'));

  results.push(attempt.result);
  if (attempt.status !== 0) exitCode = 1;
}

const totalPassed = results.reduce((sum, r) => sum + r.passed, 0);
const totalFailed = results.reduce((sum, r) => sum + r.failed, 0);
const elapsed = ((Date.now() - started) / 1000).toFixed(1);

console.log('='.repeat(62));
for (const result of results) {
  const status = result.failed ? '\x1b[31mFAIL\x1b[0m' : '\x1b[32mPASS\x1b[0m';
  const note = result.crashed ? ' (crashed before reporting)' : '';
  console.log(`${status}  ${result.suiteName.padEnd(28)} ${result.passed} passed, ${result.failed} failed${note}`);
}
console.log('='.repeat(62));
console.log(
  `\x1b[1mTOTAL: \x1b[32m${totalPassed} passed\x1b[0m`
  + `, ${totalFailed ? `\x1b[31m${totalFailed} failed\x1b[0m` : '0 failed'} in ${elapsed}s`,
);

process.exit(exitCode);
