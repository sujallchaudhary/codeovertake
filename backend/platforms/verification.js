const axios = require('axios');
const cheerio = require('cheerio');
const { getPortfolioPlatform } = require('./index');

const TIMEOUT = 15000;
const UA = 'Mozilla/5.0 (compatible; CodeOvertake/1.0)';

/**
 * Platform ownership verification.
 *
 * The user pastes a one-time code into a specific, user-editable field on their
 * external profile; we then read that field back and look for the code. This
 * proves ownership without ever asking for a password.
 *
 * Each entry declares which field the user must edit (surfaced in the UI) and
 * how to read it back. Implemented here rather than inside each adapter so the
 * existing leaderboard adapters stay untouched.
 */

/** Which field the user edits, shown in the verification instructions. */
const VERIFICATION_FIELDS = {
  github: 'OAuth (automatic)',
  leetcode: 'Summary',
  codeforces: 'First Name',
  codechef: 'Name',
  atcoder: 'Affiliation',
  geeksforgeeks: 'Display Name',
  hackerrank: 'First Name',
};

/* --------------------------------------------------------------- per platform */

const LC_PROFILE_QUERY = `
  query userPublicProfile($username: String!) {
    matchedUser(username: $username) {
      username
      profile { realName aboutMe }
    }
  }
`;

/** LeetCode: the "Summary" box maps to profile.aboutMe. */
async function leetcodeText(username) {
  const res = await axios.post(
    'https://leetcode.com/graphql',
    { query: LC_PROFILE_QUERY, variables: { username } },
    {
      timeout: TIMEOUT,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': UA,
        Referer: `https://leetcode.com/u/${username}/`,
      },
    },
  );
  const profile = res.data?.data?.matchedUser?.profile;
  if (!profile) return '';
  return [profile.aboutMe, profile.realName].filter(Boolean).join('\n');
}

/** Codeforces: firstName from the official API. */
async function codeforcesText(username) {
  const res = await axios.get(
    `https://codeforces.com/api/user.info?handles=${encodeURIComponent(username)}`,
    { timeout: TIMEOUT, headers: { 'User-Agent': UA } },
  );
  const user = res.data?.result?.[0];
  if (!user) return '';
  return [user.firstName, user.lastName, user.organization].filter(Boolean).join('\n');
}

/** CodeChef: the display name on the public profile page. */
async function codechefText(username) {
  const res = await axios.get(`https://www.codechef.com/users/${encodeURIComponent(username)}`, {
    timeout: TIMEOUT,
    headers: { 'User-Agent': UA },
  });
  const $ = cheerio.load(res.data);
  const name = $('.user-details-container h1, .user-details-container h2').first().text().trim();
  const header = $('.user-details').first().text().trim();
  return [name, header].filter(Boolean).join('\n');
}

const READERS = {
  leetcode: leetcodeText,
  codeforces: codeforcesText,
  codechef: codechefText,
};

/**
 * Reads back the verification field for a platform.
 * Falls back to the adapter's own fetchVerificationText (AtCoder, link-only
 * platforms), then to a raw fetch of the profile page.
 *
 * @returns {Promise<string>} '' when the profile could not be read
 */
async function fetchVerificationText(platformKey, username) {
  const reader = READERS[platformKey];
  try {
    if (reader) return await reader(username);

    const platform = getPortfolioPlatform(platformKey);
    if (platform?.fetchVerificationText) {
      return await platform.fetchVerificationText(username);
    }
    if (platform?.profileUrl) {
      const res = await axios.get(platform.profileUrl(username), {
        timeout: TIMEOUT,
        headers: { 'User-Agent': UA },
        maxRedirects: 5,
      });
      return typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
    }
    return '';
  } catch (error) {
    console.error(`[VERIFY] Could not read ${platformKey} profile for ${username}: ${error.message}`);
    return '';
  }
}

/**
 * True when `code` appears in the platform's verification field.
 * Comparison is case-insensitive and ignores surrounding whitespace so users
 * are not tripped up by a platform trimming or re-casing their input.
 */
function textContainsCode(text, code) {
  if (!text || !code) return false;
  return String(text).toUpperCase().includes(String(code).toUpperCase());
}

function getVerificationField(platformKey) {
  return VERIFICATION_FIELDS[platformKey] || 'Profile Name';
}

module.exports = {
  VERIFICATION_FIELDS,
  fetchVerificationText,
  textContainsCode,
  getVerificationField,
};
