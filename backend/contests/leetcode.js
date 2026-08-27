const axios = require('axios');

const TIMEOUT = 20000;
const GRAPHQL_URL = 'https://leetcode.com/graphql';

// Keep recently-finished contests around so the calendar can render past weeks
const LOOKBACK_DAYS = 60;

const CONTESTS_QUERY = `
  query allContests {
    allContests {
      title
      titleSlug
      startTime
      duration
    }
  }
`;

/**
 * LeetCode has no public REST contest API; the site's own GraphQL endpoint
 * returns every weekly/biweekly contest with epoch-second start times.
 */
async function fetchContests() {
  const res = await axios.post(
    GRAPHQL_URL,
    { query: CONTESTS_QUERY },
    {
      timeout: TIMEOUT,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (compatible; CodeOvertake/1.0)',
        Referer: 'https://leetcode.com/contest/',
      },
    },
  );

  const list = res.data?.data?.allContests;
  if (!Array.isArray(list)) throw new Error('Unexpected LeetCode response');

  const cutoff = Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000;

  return list
    .filter((c) => Number.isFinite(c.startTime) && c.startTime * 1000 >= cutoff)
    .map((c) => ({
      platform: 'leetcode',
      externalId: c.titleSlug,
      name: c.title,
      url: `https://leetcode.com/contest/${c.titleSlug}`,
      registrationUrl: `https://leetcode.com/contest/${c.titleSlug}`,
      startTime: new Date(c.startTime * 1000),
      endTime: new Date((c.startTime + (c.duration || 0)) * 1000),
      durationSeconds: c.duration || 0,
      contestType: c.title?.toLowerCase().includes('biweekly') ? 'Biweekly' : 'Weekly',
      ratedRange: '',
    }));
}

module.exports = { key: 'leetcode', label: 'LeetCode', fetchContests };
