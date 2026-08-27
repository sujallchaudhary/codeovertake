const axios = require('axios');

/**
 * Link-only platform adapters.
 *
 * GeeksforGeeks and HackerRank both render their user profiles entirely
 * client-side and expose no usable public stats API (HackerRank's /rest/hackers
 * endpoint now 404s for every handle; GFG's profile page ships no server-side
 * data payload). Rather than ship scrapers that silently return zeros and drag
 * a user's score down, these platforms are registered as *link-only*:
 *
 *   - the handle can be saved and is shown on the portfolio with a real link
 *   - problems from them are still fully trackable (see problems/metadata.js,
 *     which resolves GFG problem titles/difficulty/company tags properly)
 *   - they contribute no auto-fetched stats and no score
 *
 * `statsSupported: false` is the flag the portfolio UI reads to render these
 * differently and skip them during sync.
 */

const TIMEOUT = 15000;
const UA = 'Mozilla/5.0 (compatible; CodeOvertake/1.0)';

/**
 * Confirms the profile page exists. This is the only check we can make without
 * a stats API, and it still stops obvious typos.
 */
function makeUsernameValidator(buildUrl) {
  return async function validateUsername(username) {
    if (!username) return false;
    try {
      const res = await axios.get(buildUrl(username), {
        timeout: TIMEOUT,
        headers: { 'User-Agent': UA },
        maxRedirects: 5,
      });
      return res.status === 200;
    } catch (_error) {
      return false;
    }
  };
}

/**
 * Verification for link-only platforms: fetch the public profile HTML and let
 * portfolioService look for the code anywhere in it. Works whenever the field
 * the user edits ends up in the served markup.
 */
function makeVerificationFetcher(buildUrl) {
  return async function fetchVerificationText(username) {
    try {
      const res = await axios.get(buildUrl(username), {
        timeout: TIMEOUT,
        headers: { 'User-Agent': UA },
        maxRedirects: 5,
      });
      return typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
    } catch (_error) {
      return '';
    }
  };
}

function buildLinkOnlyPlatform({
  key, label, buildUrl, verificationField,
}) {
  return {
    key,
    label,
    leaderboard: false,
    statsSupported: false,
    verificationField,
    profileUrl: buildUrl,
    // No stats source: always null so nothing is ever overwritten with zeros
    fetchStats: async () => null,
    validateUsername: makeUsernameValidator(buildUrl),
    calculateScore: () => 0,
    fetchVerificationText: makeVerificationFetcher(buildUrl),
    profileStats: [],
    leaderboardFields: `rollno name branch year ${key} scores ranks`,
    leaderboardHeaders: [],
  };
}

const geeksforgeeks = buildLinkOnlyPlatform({
  key: 'geeksforgeeks',
  label: 'GeeksforGeeks',
  buildUrl: (username) => `https://www.geeksforgeeks.org/user/${username}/`,
  verificationField: 'Display Name',
});

const hackerrank = buildLinkOnlyPlatform({
  key: 'hackerrank',
  label: 'HackerRank',
  buildUrl: (username) => `https://www.hackerrank.com/profile/${username}`,
  verificationField: 'First Name',
});

module.exports = { geeksforgeeks, hackerrank, buildLinkOnlyPlatform };
