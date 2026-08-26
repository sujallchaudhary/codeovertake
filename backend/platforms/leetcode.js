const axios = require('axios');

const LEETCODE_GRAPHQL = 'https://leetcode.com/graphql';

const USER_PROFILE_QUERY = `
query getUserProfile($username: String!) {
  matchedUser(username: $username) {
    submitStatsGlobal {
      acSubmissionNum {
        difficulty
        count
      }
    }
    profile {
      ranking
    }
  }
  userContestRanking(username: $username) {
    rating
    attendedContestsCount
  }
}`;

async function fetchStats(username) {
  if (!username) return null;
  try {
    const res = await axios.post(
      LEETCODE_GRAPHQL,
      { query: USER_PROFILE_QUERY, variables: { username } },
      { headers: { 'Content-Type': 'application/json' }, timeout: 15000 }
    );
    const data = res.data?.data;
    if (!data?.matchedUser) return null;
    const acStats = data.matchedUser.submitStatsGlobal.acSubmissionNum;
    const getCount = (diff) => acStats.find((s) => s.difficulty === diff)?.count || 0;
    return {
      totalSolved: getCount('All'),
      easySolved: getCount('Easy'),
      mediumSolved: getCount('Medium'),
      hardSolved: getCount('Hard'),
      contestRating: Math.round(data.userContestRanking?.rating || 0),
      contestsAttended: data.userContestRanking?.attendedContestsCount || 0,
      ranking: data.matchedUser.profile?.ranking || 0,
    };
  } catch (error) {
    console.error(`LeetCode fetch error for ${username}:`, error.message);
    return null;
  }
}

async function validateUsername(username) {
  try {
    const res = await axios.post(
      LEETCODE_GRAPHQL,
      {
        query: `query { matchedUser(username: "${username}") { username } }`,
        variables: {},
      },
      { headers: { 'Content-Type': 'application/json' }, timeout: 10000 }
    );
    return !!res.data?.data?.matchedUser;
  } catch {
    return false;
  }
}

function calculateScore(stats) {
  if (!stats) return 0;
  const { easySolved = 0, mediumSolved = 0, hardSolved = 0, contestRating = 0 } = stats;
  const weightedSolved = easySolved + mediumSolved * 3 + hardSolved * 6;
  const solvedScore = Math.min(700, Math.round(700 * (1 - Math.exp(-weightedSolved / 500))));
  const contestScore = Math.min(300, Math.round((contestRating / 2000) * 300));
  return Math.min(1000, solvedScore + contestScore);
}

async function fetchHeatmap(username) {
  if (!username) return null;
  try {
    const query = `query($username: String!) {
      matchedUser(username: $username) {
        submissionCalendar
      }
    }`;
    const res = await axios.post(
      LEETCODE_GRAPHQL,
      { query, variables: { username } },
      { headers: { 'Content-Type': 'application/json' }, timeout: 15000 }
    );
    const calendar = res.data?.data?.matchedUser?.submissionCalendar;
    if (!calendar) return null;
    const parsed = JSON.parse(calendar);
    const data = {};
    for (const [ts, count] of Object.entries(parsed)) {
      if (count > 0) {
        const d = new Date(parseInt(ts) * 1000);
        const key = d.toISOString().split('T')[0];
        data[key] = count;
      }
    }
    return data;
  } catch {
    return null;
  }
}

module.exports = {
  key: 'leetcode',
  label: 'LeetCode',
  fetchStats,
  validateUsername,
  calculateScore,
  fetchHeatmap,
  profileUrl: (username) => `https://leetcode.com/u/${username}`,
  leaderboardFields: 'rollno name branch year scores.leetcode leetcode.username leetcode.stats ranks',
  leaderboardHeaders: [
    { label: 'Easy', statKey: 'leetcode.stats.easySolved' },
    { label: 'Medium', statKey: 'leetcode.stats.mediumSolved' },
    { label: 'Hard', statKey: 'leetcode.stats.hardSolved' },
    { label: 'Total', statKey: 'leetcode.stats.totalSolved' },
    { label: 'Contest', statKey: 'leetcode.stats.contestRating' },
    { label: 'Contests', statKey: 'leetcode.stats.contestsAttended' },
  ],
  profileStats: [
    { label: 'Total Solved', statKey: 'stats.totalSolved' },
    { label: 'Easy', statKey: 'stats.easySolved' },
    { label: 'Medium', statKey: 'stats.mediumSolved' },
    { label: 'Hard', statKey: 'stats.hardSolved' },
    { label: 'Contest Rating', statKey: 'stats.contestRating' },
    { label: 'Contests', statKey: 'stats.contestsAttended' },
  ],
};
