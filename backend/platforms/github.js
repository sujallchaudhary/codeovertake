const axios = require('axios');

const GITHUB_API = 'https://api.github.com';
const GITHUB_GRAPHQL = 'https://api.github.com/graphql';

async function fetchStats(username) {
  if (!username) return null;

  try {
    const headers = { Accept: 'application/vnd.github+json' };
    if (process.env.GITHUB_TOKEN) {
      headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
    }

    const userRes = await axios.get(
      `${GITHUB_API}/users/${encodeURIComponent(username)}`,
      { headers, timeout: 10000 }
    );
    const user = userRes.data;

    let totalStars = 0;
    let page = 1;
    while (true) {
      const reposRes = await axios.get(
        `${GITHUB_API}/users/${encodeURIComponent(username)}/repos`,
        { headers, params: { per_page: 100, page, type: 'owner', sort: 'updated' }, timeout: 10000 }
      );
      const repos = reposRes.data;
      totalStars += repos.reduce((sum, r) => sum + (r.stargazers_count || 0), 0);
      if (repos.length < 100) break;
      page++;
    }

    // Contributions: all-time total, not the default rolling 12-month window.
    // The default `contributionsCollection` only covers the last 365 days, so
    // old contributions silently age out every day and scores keep dropping.
    // If the GraphQL fetch fails, return null so the previous stats are kept
    // instead of overwriting contributions with 0.
    let contributions = 0;
    if (process.env.GITHUB_TOKEN) {
      contributions = await fetchAllTimeContributions(username);
      if (contributions == null) return null;
    }

    return {
      publicRepos: user.public_repos || 0,
      followers: user.followers || 0,
      totalStars,
      contributions,
    };
  } catch (error) {
    if (error.response?.status === 404) return null;
    console.error(`GitHub fetch error for ${username}:`, error.message);
    return null;
  }
}

/**
 * Sum totalContributions across every year the user has been active.
 * Returns null on any failure so callers can avoid overwriting good data.
 */
async function fetchAllTimeContributions(username) {
  const headers = { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` };
  try {
    const yearsRes = await axios.post(
      GITHUB_GRAPHQL,
      {
        query: `query($username: String!) {
          user(login: $username) { contributionsCollection { contributionYears } }
        }`,
        variables: { username },
      },
      { headers, timeout: 10000 }
    );
    if (yearsRes.data?.errors?.length) throw new Error(yearsRes.data.errors[0].message);
    const years = yearsRes.data?.data?.user?.contributionsCollection?.contributionYears;
    if (!Array.isArray(years)) throw new Error('missing contributionYears');
    if (years.length === 0) return 0;

    // One aliased query covering all years at once.
    const fields = years
      .map(
        (y) => `y${y}: contributionsCollection(from: "${y}-01-01T00:00:00Z", to: "${y}-12-31T23:59:59Z") {
          contributionCalendar { totalContributions }
        }`
      )
      .join('\n');
    const totalsRes = await axios.post(
      GITHUB_GRAPHQL,
      { query: `query($username: String!) { user(login: $username) { ${fields} } }`, variables: { username } },
      { headers, timeout: 15000 }
    );
    if (totalsRes.data?.errors?.length) throw new Error(totalsRes.data.errors[0].message);
    const user = totalsRes.data?.data?.user;
    if (!user) throw new Error('missing user in totals response');

    let total = 0;
    for (const y of years) {
      total += user[`y${y}`]?.contributionCalendar?.totalContributions || 0;
    }
    return total;
  } catch (error) {
    console.error(`GitHub contributions fetch error for ${username}:`, error.message);
    return null;
  }
}

async function validateUsername(username) {
  try {
    const headers = { Accept: 'application/vnd.github+json' };
    if (process.env.GITHUB_TOKEN) {
      headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
    }
    await axios.get(`${GITHUB_API}/users/${encodeURIComponent(username)}`, { headers, timeout: 10000 });
    return true;
  } catch {
    return false;
  }
}

function calculateScore(stats) {
  if (!stats) return 0;
  const { publicRepos = 0, totalStars = 0, followers = 0, contributions = 0 } = stats;
  const contribScore = Math.min(800, Math.round(800 * (1 - Math.exp(-contributions / 250))));
  const repoScore = Math.min(50, Math.round(50 * (1 - Math.exp(-publicRepos / 12))));
  const starScore = Math.min(100, Math.round(100 * (1 - Math.exp(-totalStars / 8))));
  const followerScore = Math.min(50, Math.round(50 * (1 - Math.exp(-followers / 8))));
  return Math.min(1000, contribScore + repoScore + starScore + followerScore);
}

async function fetchHeatmap(username) {
  if (!username || !process.env.GITHUB_TOKEN) return null;
  try {
    const query = `query($username: String!) {
      user(login: $username) {
        contributionsCollection {
          contributionCalendar {
            weeks {
              contributionDays {
                date
                contributionCount
              }
            }
          }
        }
      }
    }`;
    const res = await axios.post(
      GITHUB_GRAPHQL,
      { query, variables: { username } },
      { headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` }, timeout: 10000 }
    );
    const weeks = res.data?.data?.user?.contributionsCollection?.contributionCalendar?.weeks;
    if (!weeks) return null;
    const data = {};
    for (const week of weeks) {
      for (const day of week.contributionDays) {
        if (day.contributionCount > 0) {
          data[day.date] = day.contributionCount;
        }
      }
    }
    return data;
  } catch {
    return null;
  }
}

module.exports = {
  key: 'github',
  label: 'GitHub',
  fetchStats,
  validateUsername,
  calculateScore,
  fetchHeatmap,
  profileUrl: (username) => `https://github.com/${username}`,
  leaderboardFields: 'rollno name branch year scores.github github.username github.stats ranks',
  leaderboardHeaders: [
    { label: 'Repos', statKey: 'github.stats.publicRepos' },
    { label: 'Stars', statKey: 'github.stats.totalStars' },
    { label: 'Followers', statKey: 'github.stats.followers' },
    { label: 'Contributions', statKey: 'github.stats.contributions' },
  ],
  profileStats: [
    { label: 'Repos', statKey: 'stats.publicRepos' },
    { label: 'Stars', statKey: 'stats.totalStars' },
    { label: 'Followers', statKey: 'stats.followers' },
    { label: 'Contributions', statKey: 'stats.contributions' },
  ],
};
