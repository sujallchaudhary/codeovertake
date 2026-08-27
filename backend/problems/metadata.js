const axios = require('axios');
const cheerio = require('cheerio');
const {
  titleFromSlug,
  normalizeDifficulty,
  difficultyFromCfRating,
} = require('../utils/problemUrl');

const TIMEOUT = 15000;
const UA = 'Mozilla/5.0 (compatible; CodeOvertake/1.0)';

/* ------------------------------------------------------------------ LeetCode */

const LC_QUESTION_QUERY = `
  query questionData($titleSlug: String!) {
    question(titleSlug: $titleSlug) {
      questionFrontendId
      title
      titleSlug
      difficulty
      isPaidOnly
      topicTags { name }
      stats
    }
  }
`;

async function fetchLeetcodeMetadata(slug) {
  const res = await axios.post(
    'https://leetcode.com/graphql',
    { query: LC_QUESTION_QUERY, variables: { titleSlug: slug } },
    {
      timeout: TIMEOUT,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': UA,
        Referer: `https://leetcode.com/problems/${slug}/`,
      },
    },
  );

  const q = res.data?.data?.question;
  if (!q) return null;

  let acceptanceRate = 0;
  try {
    // stats is a JSON *string* like {"acRate":"52.1%",...}
    const parsed = JSON.parse(q.stats || '{}');
    acceptanceRate = parseFloat(String(parsed.acRate || '').replace('%', '')) || 0;
  } catch (_err) { /* non-fatal */ }

  return {
    title: q.title,
    difficulty: normalizeDifficulty(q.difficulty),
    topics: (q.topicTags || []).map((t) => t.name),
    externalId: q.questionFrontendId || '',
    isPremium: Boolean(q.isPaidOnly),
    acceptanceRate,
  };
}

/* ---------------------------------------------------------------- Codeforces */

// The whole problemset is one ~3MB response; cache it for a day.
let _cfCache = { at: 0, byKey: null };
const CF_CACHE_MS = 24 * 60 * 60 * 1000;

async function loadCodeforcesProblemset() {
  if (_cfCache.byKey && Date.now() - _cfCache.at < CF_CACHE_MS) {
    return _cfCache.byKey;
  }
  const res = await axios.get('https://codeforces.com/api/problemset.problems', {
    timeout: 30000,
    headers: { 'User-Agent': UA },
  });
  if (res.data?.status !== 'OK') throw new Error('Unexpected Codeforces response');

  const byKey = new Map();
  for (const p of res.data.result.problems || []) {
    byKey.set(`${p.contestId}-${p.index}`.toUpperCase(), p);
  }
  _cfCache = { at: Date.now(), byKey };
  return byKey;
}

async function fetchCodeforcesMetadata(slug) {
  const byKey = await loadCodeforcesProblemset();
  const p = byKey.get(String(slug).toUpperCase());
  if (!p) return null;
  return {
    title: p.name,
    difficulty: difficultyFromCfRating(p.rating),
    rating: p.rating || 0,
    topics: p.tags || [],
    externalId: `${p.contestId}${p.index}`,
    isPremium: false,
  };
}

/* ------------------------------------------------------------- GeeksforGeeks */

/**
 * GFG's practice API is undocumented but stable and returns difficulty plus
 * topic *and* company tags — the latter feed the Company Kits for free.
 */
async function fetchGfgMetadata(slug) {
  const res = await axios.get(
    `https://practiceapi.geeksforgeeks.org/api/latest/problems/${encodeURIComponent(slug)}/`,
    { timeout: TIMEOUT, headers: { 'User-Agent': UA, Accept: 'application/json' } },
  );

  const r = res.data?.results;
  if (!r?.problem_name) return null;

  return {
    title: r.problem_name,
    difficulty: normalizeDifficulty(r.difficulty || r.problem_level_text),
    topics: (r.tags?.topic_tags || []).filter(Boolean),
    companyTags: (r.tags?.company_tags || []).filter(Boolean),
    externalId: String(r.id || ''),
    acceptanceRate: parseFloat(String(r.accuracy || '').replace('%', '')) || 0,
    isPremium: false,
  };
}

/* ------------------------------------------------------------------- Generic */

/** Removes the site's boilerplate suffix from an HTML <title>. */
function cleanPageTitle(raw) {
  return String(raw || '')
    .replace(/\s+/g, ' ')
    .trim()
    // " - GeeksforGeeks", " | Practice | GeeksforGeeks", " - LeetCode", ...
    .replace(/\s*[|\-–]\s*(Practice\s*[|\-–]\s*)?(GeeksforGeeks|LeetCode|CodeChef|AtCoder|HackerRank|InterviewBit|Naukri Code ?360|Coding Ninjas|SPOJ\.com|HackerEarth)\s*$/i, '')
    .replace(/^Problem\s*[-–:]\s*/i, '')
    .trim();
}

/**
 * Hosts the generic scraper is allowed to fetch.
 *
 * `POST /api/problems/resolve` is reachable without authentication, so without
 * an allowlist it would be a server-side request forgery primitive: any caller
 * could make the backend GET an arbitrary URL (cloud metadata endpoints, private
 * network hosts) and read the response title back. Only the problem sites we
 * actually support are fetchable; anything else falls back to a slug-derived
 * title with no network call at all.
 */
const SCRAPEABLE_HOSTS = new Set([
  'atcoder.jp', 'www.atcoder.jp',
  'www.hackerrank.com', 'hackerrank.com',
  'www.interviewbit.com', 'interviewbit.com',
  'www.naukri.com', 'naukri.com',
  'www.codingninjas.com', 'codingninjas.com',
  'www.spoj.com', 'spoj.com',
  'www.hackerearth.com', 'hackerearth.com',
  'www.codechef.com', 'codechef.com',
  'www.geeksforgeeks.org', 'geeksforgeeks.org', 'practice.geeksforgeeks.org',
]);

function isScrapeableUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
    return SCRAPEABLE_HOSTS.has(parsed.hostname.toLowerCase());
  } catch (_err) {
    return false;
  }
}

/**
 * Best-effort scrape for platforms with no usable API. Reads the <h1>/<title>
 * and looks for a difficulty word near the standard markers.
 *
 * Refuses any host outside SCRAPEABLE_HOSTS.
 */
async function fetchGenericMetadata(url) {
  if (!isScrapeableUrl(url)) {
    throw new Error(`Refusing to fetch metadata from an unsupported host: ${url}`);
  }

  const res = await axios.get(url, {
    timeout: TIMEOUT,
    headers: { 'User-Agent': UA, 'Accept-Language': 'en' },
    maxRedirects: 2,
  });

  const $ = cheerio.load(res.data);
  const title = cleanPageTitle(
    $('meta[property="og:title"]').attr('content')
    || $('h1').first().text()
    || $('title').first().text(),
  );
  if (!title) return null;

  // GFG/HackerRank surface difficulty in a small badge; search a trimmed slice
  const body = $('body').text().replace(/\s+/g, ' ').slice(0, 4000);
  const diffMatch = body.match(/Difficulty\s*:?\s*(Easy|Medium|Hard|Basic|School)/i);

  // Topic chips are inconsistent across sites, so only take obvious ones
  const topics = [];
  $('a[href*="/tag/"], a[href*="/topics/"], a[href*="category"]').slice(0, 6).each((_i, el) => {
    const text = $(el).text().trim();
    if (text && text.length < 30) topics.push(text);
  });

  return {
    title,
    difficulty: diffMatch ? normalizeDifficulty(diffMatch[1]) : 'unrated',
    topics: [...new Set(topics)],
  };
}

/**
 * Client-rendered sites (Code360, InterviewBit) serve the same marketing <title>
 * on every problem page. Detect that so we fall back to the slug instead of
 * naming every question "Code 360 by Coding Ninjas".
 */
const BOILERPLATE_TITLES = [
  /^code\s*360\b/i,
  /^coding ninjas/i,
  /^interviewbit/i,
  /^online (?:coding|programming)/i,
  /^(?:log ?in|sign ?in|access denied|just a moment|attention required)/i,
  /^practice\s*\|/i,
];

/**
 * Platforms whose slugs are opaque codes (abc100_a, 1234-A, FLOW001) rather than
 * a slugified title. For these, a title that shares no word with the slug is
 * perfectly normal, so the similarity heuristic must not run.
 */
const CODE_SLUG_PLATFORMS = new Set(['atcoder', 'codeforces', 'codechef', 'spoj']);

function looksBoilerplate(title, slug, platform) {
  if (!title) return true;
  if (BOILERPLATE_TITLES.some((re) => re.test(title))) return true;
  if (CODE_SLUG_PLATFORMS.has(platform)) return false;

  // For title-derived slugs, a title sharing no meaningful word is suspicious.
  const slugWords = new Set(
    String(slug).toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3),
  );
  if (!slugWords.size) return false;
  const titleWords = String(title).toLowerCase().split(/[^a-z0-9]+/);
  return !titleWords.some((w) => slugWords.has(w));
}

/**
 * Resolves display metadata for a parsed problem reference.
 * Never throws: on any failure it degrades to a title derived from the slug so
 * the user's question still gets tracked.
 *
 * @param {{platform:string, slug:string, canonicalUrl:string}} ref
 * @returns {Promise<{title:string,difficulty:string,topics:string[],partial:boolean,
 *                    rating?:number,externalId?:string,isPremium?:boolean,
 *                    acceptanceRate?:number,companyTags?:string[]}>}
 */
async function fetchProblemMetadata(ref) {
  // Code360 slugs carry a trailing numeric id that is noise in a title
  const slugTail = ref.slug.split('/').pop().replace(/_\d+$/, '');
  const fallback = {
    title: titleFromSlug(slugTail),
    difficulty: 'unrated',
    topics: [],
    partial: true,
  };

  // Unrecognised hosts are still trackable, but we never fetch them: see
  // SCRAPEABLE_HOSTS above for why.
  if (ref.platform === 'other') return fallback;

  try {
    let meta = null;
    if (ref.platform === 'leetcode') {
      meta = await fetchLeetcodeMetadata(ref.slug);
    } else if (ref.platform === 'codeforces') {
      meta = await fetchCodeforcesMetadata(ref.slug);
    } else if (ref.platform === 'geeksforgeeks') {
      meta = await fetchGfgMetadata(ref.slug);
    } else {
      meta = await fetchGenericMetadata(ref.canonicalUrl);
    }

    if (!meta || !meta.title) return fallback;

    // Keep the real difficulty/topics even when the scraped title is junk
    if (looksBoilerplate(meta.title, slugTail, ref.platform)) {
      return { ...meta, title: fallback.title, partial: true };
    }
    return { ...meta, partial: false };
  } catch (err) {
    console.error(`[PROBLEM META] ${ref.platform}/${ref.slug}: ${err.message}`);
    return fallback;
  }
}

/* ------------------------------------------------- Remote search (LeetCode) */

const LC_SEARCH_QUERY = `
  query problemsetQuestionList($limit: Int, $skip: Int, $filters: QuestionListFilterInput) {
    questionList(categorySlug: "", limit: $limit, skip: $skip, filters: $filters) {
      total: totalNum
      questions: data {
        questionFrontendId
        title
        titleSlug
        difficulty
        isPaidOnly
        topicTags { name }
      }
    }
  }
`;

/**
 * Searches LeetCode's own problem list so "search by name" works even before
 * the local catalog has been seeded. Returns [] on failure.
 */
async function searchLeetcodeProblems(keyword, limit = 15, skip = 0) {
  try {
    const res = await axios.post(
      'https://leetcode.com/graphql',
      {
        query: LC_SEARCH_QUERY,
        variables: { limit, skip, filters: keyword ? { searchKeywords: keyword } : {} },
      },
      {
        timeout: TIMEOUT,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': UA,
          Referer: 'https://leetcode.com/problemset/',
        },
      },
    );

    const list = res.data?.data?.questionList;
    if (!list?.questions) return { total: 0, problems: [] };

    return {
      total: list.total || 0,
      problems: list.questions.map((q) => ({
        platform: 'leetcode',
        slug: q.titleSlug,
        title: q.title,
        url: `https://leetcode.com/problems/${q.titleSlug}/`,
        difficulty: normalizeDifficulty(q.difficulty),
        topics: (q.topicTags || []).map((t) => t.name),
        externalId: q.questionFrontendId || '',
        isPremium: Boolean(q.isPaidOnly),
      })),
    };
  } catch (err) {
    console.error('[PROBLEM SEARCH] LeetCode search failed:', err.message);
    return { total: 0, problems: [] };
  }
}

/** Streams the full Codeforces problemset in catalog-row shape (for seeding). */
async function listAllCodeforcesProblems() {
  const byKey = await loadCodeforcesProblemset();
  return [...byKey.entries()].map(([key, p]) => ({
    platform: 'codeforces',
    slug: key,
    title: p.name,
    url: `https://codeforces.com/problemset/problem/${p.contestId}/${p.index}`,
    difficulty: difficultyFromCfRating(p.rating),
    rating: p.rating || 0,
    topics: p.tags || [],
    externalId: `${p.contestId}${p.index}`,
  }));
}

module.exports = {
  fetchProblemMetadata,
  fetchLeetcodeMetadata,
  fetchCodeforcesMetadata,
  fetchGfgMetadata,
  fetchGenericMetadata,
  isScrapeableUrl,
  searchLeetcodeProblems,
  listAllCodeforcesProblems,
};
