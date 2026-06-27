const axios = require('axios');
const cheerio = require('cheerio');

const CC_URL = 'https://www.codechef.com/users';

async function scrapeStats(username) {
  if (!username) return null;
  try {
    const res = await axios.get(`${CC_URL}/${encodeURIComponent(username)}`, {
      timeout: 15000,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    });
    const html = res.data;
    const $ = cheerio.load(html);

    // Problems solved
    const solvedMatch = html.match(/Total Problems Solved:\s*(\d+)/);
    const totalProblemsSolved = solvedMatch ? parseInt(solvedMatch[1]) : 0;

    // Stars from .rating-star (count ★ chars)
    const starText = $('.rating-star').first().text().trim();
    const stars = (starText.match(/★/g) || []).length;

    // Current rating from first .rating-container
    let currentRating = 0;
    const ratingText = $('.rating-container').first().text().trim();
    const ratingNum = ratingText.match(/^(\d+)/);
    if (ratingNum) currentRating = parseInt(ratingNum[1]);

    // Highest rating from all_rating JS variable
    let highestRating = currentRating;
    const ratingArrMatch = html.match(/var all_rating\s*=\s*(\[[\s\S]*?\]);/);
    if (ratingArrMatch) {
      try {
        const arr = JSON.parse(ratingArrMatch[1]);
        for (const entry of arr) {
          const r = parseInt(entry.rating);
          if (r > highestRating) highestRating = r;
        }
      } catch (_) {}
    }

    // Global/Country rank from .rating-ranks
    let globalRank = 0;
    let countryRank = 0;
    $('.rating-ranks li').each(function () {
      const text = $(this).text().trim();
      const rankNum = text.match(/(\d+)/);
      if (text.includes('Global Rank') && rankNum) {
        globalRank = parseInt(rankNum[1]);
      } else if (text.includes('Country Rank') && rankNum) {
        countryRank = parseInt(rankNum[1]);
      }
    });

    return {
      currentRating,
      highestRating,
      stars,
      globalRank,
      countryRank,
      totalProblemsSolved,
    };
  } catch (error) {
    if (error.response?.status === 404) return null;
    console.error(`CodeChef fetch error for ${username}:`, error.message);
    throw error;
  }
}

async function fetchStats(username) {
  try {
    return await scrapeStats(username);
  } catch {
    return null;
  }
}

async function fetchStatsWithStatus(username) {
  if (!username) return { stats: null, lastFetchFailed: false };

  try {
    const stats = await scrapeStats(username);
    return { stats, lastFetchFailed: false };
  } catch (error) {
    return { stats: null, lastFetchFailed: error.response?.status !== 404 };
  }
}

async function validateUsername(username) {
  try {
    const res = await axios.get(`${CC_URL}/${encodeURIComponent(username)}`, {
      timeout: 10000,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    });
    // A valid profile page will contain "Total Problems Solved"
    return res.data.includes('Total Problems Solved');
  } catch {
    return false;
  }
}

function calculateScore(stats) {
  if (!stats) return 0;
  const { currentRating = 0, highestRating = 0, totalProblemsSolved = 0 } = stats;

  // Problems solved: primary metric, max 500 pts
  const solvedScore = Math.min(500, Math.round(500 * (1 - Math.exp(-totalProblemsSolved / 300))));
  // Current rating: max 400 pts (2000 rating → 400)
  const ratingScore = Math.min(400, Math.round((currentRating / 2000) * 400));
  // Highest rating: minor bonus, max 100 pts
  const maxRatingScore = Math.min(100, Math.round((highestRating / 2000) * 100));

  return Math.min(1000, solvedScore + ratingScore + maxRatingScore);
}

module.exports = {
  key: 'codechef',
  label: 'CodeChef',
  fetchStats,
  fetchStatsWithStatus,
  validateUsername,
  calculateScore,
  profileUrl: (username) => `https://www.codechef.com/users/${username}`,
  leaderboardFields: 'rollno name branch year scores.codechef codechef.username codechef.stats ranks',
  leaderboardHeaders: [
    { label: 'Rating', statKey: 'codechef.stats.currentRating' },
    { label: 'Max Rating', statKey: 'codechef.stats.highestRating' },
    { label: 'Stars', statKey: 'codechef.stats.stars' },
    { label: 'Solved', statKey: 'codechef.stats.totalProblemsSolved' },
  ],
  profileStats: [
    { label: 'Current Rating', statKey: 'stats.currentRating' },
    { label: 'Highest Rating', statKey: 'stats.highestRating' },
    { label: 'Stars', statKey: 'stats.stars' },
    { label: 'Global Rank', statKey: 'stats.globalRank' },
    { label: 'Country Rank', statKey: 'stats.countryRank' },
    { label: 'Problems Solved', statKey: 'stats.totalProblemsSolved' },
  ],
};
