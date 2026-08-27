const crypto = require('crypto');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

/**
 * Shared test harness.
 *
 * Every suite runs against a real MongoDB (an in-process ephemeral server) and
 * the real Express app over HTTP, so route wiring, validators, middleware and
 * services are all exercised together rather than mocked.
 *
 * Suites run as separate processes (see run.js) so each gets a clean database -
 * several of them create the same fixture emails and would otherwise collide on
 * the unique index.
 */

/**
 * Boots an ephemeral MongoDB plus the app, and returns an HTTP client for it.
 * @returns {Promise<{api:Function, BASE:string, app:Object, stop:Function}>}
 */
async function bootstrap() {
  const mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();
  await mongoose.connect(process.env.MONGODB_URI);

  // Required only after the URI is set, so models bind to this connection
  // eslint-disable-next-line global-require
  const app = require('../app');
  const server = app.listen(0);
  const BASE = `http://127.0.0.1:${server.address().port}/api`;

  /**
   * @param {string} method
   * @param {string} path route path below /api
   * @param {{body?:Object, token?:string, raw?:string, headers?:Object}} options
   *   `raw` sends a pre-serialised body, needed for webhook signature tests.
   */
  async function api(method, path, options = {}) {
    const {
      body, token, raw, headers: extra,
    } = options;
    const headers = { 'Content-Type': 'application/json', ...(extra || {}) };
    if (token) headers.Authorization = `Bearer ${token}`;

    const res = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: raw !== undefined ? raw : (body ? JSON.stringify(body) : undefined),
    });

    let json = null;
    try {
      json = await res.json();
    } catch (_error) {
      // Empty body (204, or an error page) — callers assert on status instead
    }
    return { status: res.status, body: json };
  }

  async function stop() {
    server.close();
    await mongoose.disconnect();
    await mongod.stop();
  }

  return {
    api, BASE, app, stop,
  };
}

/**
 * Creates a local account the way Clerk just-in-time provisioning would, plus an
 * extension pairing token to authenticate with.
 *
 * Clerk session tokens cannot be minted without a live Clerk instance, so the
 * suites authenticate through the pairing-token branch of `requireAuth`. That is
 * the same middleware and the same local user resolution; only Clerk's signature
 * check is skipped (and that is asserted separately).
 */
async function createUser({
  name, email, handle, verifiedEmails = [], platforms = {},
}) {
  // eslint-disable-next-line global-require
  const User = require('../models/User');

  const token = crypto.randomBytes(24).toString('hex');
  const user = new User({
    clerkUserId: `user_${crypto.randomBytes(8).toString('hex')}`,
    email,
    verifiedEmails: verifiedEmails.length ? verifiedEmails : [email],
    name,
    handle,
    extensionToken: token,
  });

  Object.entries(platforms).forEach(([key, value]) => {
    user.platforms[key].username = value.username;
    user.platforms[key].verified = Boolean(value.verified);
    if (value.verified) user.platforms[key].verifiedAt = new Date();
  });

  await user.save();
  return { user, token };
}

/**
 * Minimal assertion reporter. Deliberately not a test framework: it prints a
 * readable transcript and returns an exit code, which is all CI needs.
 *
 * Returns plain closures rather than methods so suites can destructure
 * `{ check, section }` without losing `this`.
 */
function createReporter(suiteName) {
  let passed = 0;
  let failed = 0;
  const failures = [];

  console.log(`\n\x1b[1m\x1b[35m▶ ${suiteName}\x1b[0m`);

  return {
    check(name, condition, detail = '') {
      if (condition) {
        passed += 1;
        console.log(`  \x1b[32m✓\x1b[0m ${name}`);
      } else {
        failed += 1;
        failures.push(name);
        console.log(`  \x1b[31m✗ ${name}\x1b[0m ${detail}`);
      }
    },

    section(title) {
      console.log(`\n\x1b[1m\x1b[36m${title}\x1b[0m`);
    },

    /** Records an unexpected throw as a failure so the suite still reports. */
    crash(error) {
      failed += 1;
      failures.push(`EXCEPTION: ${error.message}`);
      console.error('\n\x1b[31mUNCAUGHT ERROR\x1b[0m', error);
    },

    /** Prints the summary and returns the process exit code. */
    finish() {
      console.log(`\n${'-'.repeat(62)}`);
      console.log(
        `\x1b[1m${suiteName}: \x1b[32m${passed} passed\x1b[0m`
        + `, ${failed ? `\x1b[31m${failed} failed\x1b[0m` : '0 failed'}`,
      );
      if (failures.length) {
        console.log('\nFailures:');
        failures.forEach((f) => console.log(`  - ${f}`));
      }
      // Machine-readable line for the aggregator in run.js
      console.log(`##SUITE_RESULT ${JSON.stringify({ suiteName, passed, failed })}`);
      return failed ? 1 : 0;
    },
  };
}

module.exports = { bootstrap, createUser, createReporter };
