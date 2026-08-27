/**
 * Contest source registry.
 *
 * Each module exports:
 *   key            - matches the coding-platform key where one exists
 *   label          - display name
 *   fetchContests() - resolves to an array of normalized contests:
 *                     { platform, externalId, name, url, registrationUrl,
 *                       startTime, endTime, durationSeconds, contestType, ratedRange }
 *
 * Sources throw on failure; contestService isolates each one so a single broken
 * scraper never blocks the others.
 */

const codeforces = require('./codeforces');
const leetcode = require('./leetcode');
const codechef = require('./codechef');
const atcoder = require('./atcoder');

const sources = [leetcode, codeforces, codechef, atcoder];

const sourceMap = {};
for (const s of sources) sourceMap[s.key] = s;

function getAllSources() {
  return sources;
}

function getSource(key) {
  return sourceMap[key] || null;
}

function getSourceKeys() {
  return sources.map((s) => s.key);
}

module.exports = { getAllSources, getSource, getSourceKeys };
