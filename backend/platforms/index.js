/**
 * Platform Registry
 *
 * Each platform module must export:
 *   key         - unique identifier (used in DB fields, routes, etc.)
 *   label       - display name
 *   fetchStats(username)      - returns stats object or null
 *   validateUsername(username) - returns boolean
 *   calculateScore(stats)     - returns number 0–1000
 *   profileUrl(username)      - returns external profile URL
 *   leaderboardFields         - Mongoose select string for leaderboard queries
 *   leaderboardHeaders        - array of { label, statKey } for table columns
 *
 * Optional:
 *   fetchHeatmap(username)         - daily activity map
 *   fetchStatsWithStatus(username) - { stats, lastFetchFailed }
 *   fetchVerificationText(username)- profile text searched for a verification code
 *   profileStats                   - [{ label, statKey }] for profile pages
 *
 * ── Two tiers ────────────────────────────────────────────────────────────────
 * `leaderboard: false` marks a platform as *portfolio-only*. The NSUT leaderboard
 * (Student model, ranking, cron, analytics) intentionally keeps its original
 * four platforms so existing scores and rankings stay comparable, while personal
 * portfolios can link the wider set of platforms Codolio supports.
 *
 * Use getAllPlatforms() for leaderboard code and getPortfolioPlatforms() for
 * user-portfolio code.
 */

const github = require('./github');
const leetcode = require('./leetcode');
const codeforces = require('./codeforces');
const codechef = require('./codechef');
const atcoder = require('./atcoder');
const { geeksforgeeks, hackerrank } = require('./linkOnly');

/** Platforms that count towards the NSUT leaderboard score. Do not reorder. */
const platforms = [github, leetcode, codeforces, codechef];

/** Every platform a user can attach to their portfolio. */
const allPlatforms = [...platforms, atcoder, geeksforgeeks, hackerrank];

// Map by key for fast lookup
const platformMap = {};
for (const p of platforms) {
  platformMap[p.key] = p;
}

const allPlatformMap = {};
for (const p of allPlatforms) {
  allPlatformMap[p.key] = p;
}

/** Leaderboard platforms only (github, leetcode, codeforces, codechef). */
function getAllPlatforms() {
  return platforms;
}

function getPlatform(key) {
  return platformMap[key] || null;
}

function getPlatformKeys() {
  return platforms.map((p) => p.key);
}

/** Every registered platform, including portfolio-only ones. */
function getPortfolioPlatforms() {
  return allPlatforms;
}

function getPortfolioPlatform(key) {
  return allPlatformMap[key] || null;
}

function getPortfolioPlatformKeys() {
  return allPlatforms.map((p) => p.key);
}

/** Portfolio platforms that can actually auto-fetch stats. */
function getStatsCapablePlatforms() {
  return allPlatforms.filter((p) => p.statsSupported !== false);
}

// Calculate total score from a scores object (leaderboard platforms only)
function calculateTotalScore(scores) {
  return platforms.reduce((sum, p) => sum + (scores[p.key] || 0), 0);
}

// Build the $or filter for students with at least one username
function buildHasUsernameFilter() {
  return { $or: platforms.map((p) => ({ [`${p.key}.username`]: { $ne: '' } })) };
}

module.exports = {
  getAllPlatforms,
  getPlatform,
  getPlatformKeys,
  getPortfolioPlatforms,
  getPortfolioPlatform,
  getPortfolioPlatformKeys,
  getStatsCapablePlatforms,
  calculateTotalScore,
  buildHasUsernameFilter,
};
