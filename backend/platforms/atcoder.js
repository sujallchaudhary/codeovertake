const axios = require('axios');
const cheerio = require('cheerio');

const TIMEOUT = 20000;
const UA = 'Mozilla/5.0 (compatible; CodeOvertake/1.0)';

/**
 * AtCoder has no official user API, but two stable JSON endpoints exist:
 *   - atcoder.jp/users/<u>/history/json  -> full rated contest history
 *   - kenkoooo.com AtCoder Problems API  -> accepted-problem count and rank
 */
const HISTORY_URL = (username) => `https://atcoder.jp/users/${encodeURIComponent(username)}/history/json`;
const AC_RANK_URL = (username) => `https://kenkoooo.com/atcoder/atcoder-api/v3/user/ac_rank?user=${encodeURIComponent(username)}`;

function profileUrl(username) {
  return `https://atcoder.jp/users/${username}`;
}

/** AtCoder's colour bands, used as the textual "rank" like Codeforces. */
function ratingToRank(rating) {
  if (!rating) return '';
  if (rating < 400) return 'Gray';
  if (rating < 800) return 'Brown';
  if (rating < 1200) return 'Green';
  if (rating < 1600) return 'Cyan';
  if (rating < 2000) return 'Blue';
  if (rating < 2400) return 'Yellow';
  if (rating < 2800) return 'Orange';
  return 'Red';
}

async function fetchStats(username) {
  if (!username) return null;

  try {
    const [historyRes, acRes] = await Promise.all([
      axios.get(HISTORY_URL(username), { timeout: TIMEOUT, headers: { 'User-Agent': UA } }),
      axios.get(AC_RANK_URL(username), { timeout: TIMEOUT, headers: { 'User-Agent': UA } })
        .catch(() => null),
    ]);

    const history = Array.isArray(historyRes.data) ? historyRes.data : [];
    const rated = history.filter((h) => h.IsRated);

    const rating = rated.length ? rated[rated.length - 1].NewRating : 0;
    const maxRating = rated.reduce((max, h) => Math.max(max, h.NewRating || 0), 0);

    return {
      rating,
      maxRating,
      rank: ratingToRank(rating),
      maxRank: ratingToRank(maxRating),
      contestsAttended: rated.length,
      problemsSolved: acRes?.data?.count || 0,
      globalRank: acRes?.data?.rank || 0,
    };
  } catch (error) {
    console.error(`[ATCODER] fetchStats failed for ${username}: ${error.message}`);
    return null;
  }
}

async function validateUsername(username) {
  if (!username) return false;
  try {
    // axios throws on 404, which the catch below turns into `false`
    const res = await axios.get(profileUrl(username), {
      timeout: TIMEOUT,
      headers: { 'User-Agent': UA },
    });
    return res.status === 200;
  } catch (_error) {
    return false;
  }
}

/**
 * Same shape as the Codeforces formula so cross-platform CP scores stay
 * comparable: volume, current rating, then a small peak-rating bonus.
 */
function calculateScore(stats) {
  if (!stats) return 0;
  const solved = stats.problemsSolved || 0;
  const rating = stats.rating || 0;
  const maxRating = stats.maxRating || 0;

  const volume = 500 * (1 - Math.exp(-solved / 400));
  const current = Math.min(400, (rating / 2000) * 400);
  const peak = Math.min(100, (maxRating / 2000) * 100);

  return Math.round(Math.min(1000, volume + current + peak));
}

/**
 * AtCoder verification uses the Affiliation field on the settings page, which is
 * rendered server-side on the public profile table.
 */
async function fetchVerificationText(username) {
  try {
    const res = await axios.get(profileUrl(username), {
      timeout: TIMEOUT,
      headers: { 'User-Agent': UA, 'Accept-Language': 'en' },
    });
    const $ = cheerio.load(res.data);
    // The profile table rows are "<th>Affiliation</th><td>...</td>"
    let affiliation = '';
    $('table tr').each((_i, el) => {
      const label = $(el).find('th').first().text().trim().toLowerCase();
      if (label === 'affiliation') affiliation = $(el).find('td').first().text().trim();
    });
    return affiliation || $('body').text().slice(0, 3000);
  } catch (_error) {
    return '';
  }
}

module.exports = {
  key: 'atcoder',
  label: 'AtCoder',
  // Portfolio-only: not part of the NSUT leaderboard score
  leaderboard: false,
  statsSupported: true,
  verificationField: 'Affiliation',
  fetchStats,
  validateUsername,
  calculateScore,
  profileUrl,
  fetchVerificationText,
  profileStats: [
    { label: 'Rating', statKey: 'rating' },
    { label: 'Max Rating', statKey: 'maxRating' },
    { label: 'Solved', statKey: 'problemsSolved' },
    { label: 'Contests', statKey: 'contestsAttended' },
  ],
  leaderboardFields: 'rollno name branch year atcoder scores ranks',
  leaderboardHeaders: [
    { label: 'Rating', statKey: 'rating' },
    { label: 'Max', statKey: 'maxRating' },
    { label: 'Solved', statKey: 'problemsSolved' },
  ],
};
