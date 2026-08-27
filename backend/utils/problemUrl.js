/**
 * Problem URL parsing.
 *
 * Codolio's core "paste a link and we figure out the rest" behaviour starts
 * here: every supported platform gets a matcher that turns an arbitrary problem
 * URL into { platform, slug, canonicalUrl } so the same problem pasted in three
 * different shapes still resolves to one catalog row.
 */

// Display metadata for every problem source we can track.
const PROBLEM_PLATFORMS = [
  { key: 'leetcode', label: 'LeetCode' },
  { key: 'geeksforgeeks', label: 'GeeksforGeeks' },
  { key: 'codeforces', label: 'Codeforces' },
  { key: 'codechef', label: 'CodeChef' },
  { key: 'atcoder', label: 'AtCoder' },
  { key: 'hackerrank', label: 'HackerRank' },
  { key: 'interviewbit', label: 'InterviewBit' },
  { key: 'codestudio', label: 'Code360' },
  { key: 'spoj', label: 'SPOJ' },
  { key: 'hackerearth', label: 'HackerEarth' },
  { key: 'other', label: 'Other' },
];

const PLATFORM_LABELS = PROBLEM_PLATFORMS.reduce((acc, p) => {
  acc[p.key] = p.label;
  return acc;
}, {});

/**
 * Ordered matchers. `test` runs against the normalized URL; the first hit wins.
 * `slug` must be stable and unique within the platform.
 */
const MATCHERS = [
  {
    platform: 'leetcode',
    // /problems/two-sum, /problems/two-sum/description/, ?envType=...
    test: /^https?:\/\/(?:www\.)?leetcode\.com\/problems\/([a-z0-9-]+)/i,
    slug: (m) => m[1].toLowerCase(),
    canonical: (slug) => `https://leetcode.com/problems/${slug}/`,
  },
  {
    platform: 'leetcode',
    // Regional mirror: leetcode.cn
    test: /^https?:\/\/(?:www\.)?leetcode\.cn\/problems\/([a-z0-9-]+)/i,
    slug: (m) => m[1].toLowerCase(),
    canonical: (slug) => `https://leetcode.com/problems/${slug}/`,
  },
  {
    platform: 'codeforces',
    // /contest/1234/problem/A  and  /gym/1234/problem/A
    test: /^https?:\/\/(?:www\.)?codeforces\.com\/(?:contest|gym)\/(\d+)\/problem\/([A-Za-z]\d?)/i,
    slug: (m) => `${m[1]}-${m[2].toUpperCase()}`,
    canonical: (slug) => {
      const [id, index] = slug.split('-');
      return `https://codeforces.com/contest/${id}/problem/${index}`;
    },
  },
  {
    platform: 'codeforces',
    // /problemset/problem/1234/A
    test: /^https?:\/\/(?:www\.)?codeforces\.com\/problemset\/problem\/(\d+)\/([A-Za-z]\d?)/i,
    slug: (m) => `${m[1]}-${m[2].toUpperCase()}`,
    canonical: (slug) => {
      const [id, index] = slug.split('-');
      return `https://codeforces.com/problemset/problem/${id}/${index}`;
    },
  },
  {
    platform: 'codechef',
    test: /^https?:\/\/(?:www\.)?codechef\.com\/problems\/([A-Za-z0-9_-]+)/i,
    slug: (m) => m[1].toUpperCase(),
    canonical: (slug) => `https://www.codechef.com/problems/${slug}`,
  },
  {
    platform: 'codechef',
    // Contest-scoped problem link: /JAN21A/problems/CODE
    test: /^https?:\/\/(?:www\.)?codechef\.com\/[A-Za-z0-9]+\/problems\/([A-Za-z0-9_-]+)/i,
    slug: (m) => m[1].toUpperCase(),
    canonical: (slug) => `https://www.codechef.com/problems/${slug}`,
  },
  {
    platform: 'geeksforgeeks',
    // Practice portal: /problems/<slug>/1
    test: /^https?:\/\/(?:practice\.|www\.)?geeksforgeeks\.org\/problems\/([a-z0-9._-]+)/i,
    slug: (m) => m[1].toLowerCase().replace(/\/$/, ''),
    canonical: (slug) => `https://www.geeksforgeeks.org/problems/${slug}/1`,
  },
  {
    platform: 'atcoder',
    test: /^https?:\/\/(?:www\.)?atcoder\.jp\/contests\/([a-z0-9_-]+)\/tasks\/([a-z0-9_-]+)/i,
    slug: (m) => m[2].toLowerCase(),
    canonical: (slug) => {
      // AtCoder task ids embed their contest: abc473_a -> contests/abc473
      const contest = slug.split('_')[0];
      return `https://atcoder.jp/contests/${contest}/tasks/${slug}`;
    },
  },
  {
    platform: 'hackerrank',
    test: /^https?:\/\/(?:www\.)?hackerrank\.com\/(?:challenges|contests\/[a-z0-9-]+\/challenges)\/([a-z0-9-]+)/i,
    slug: (m) => m[1].toLowerCase(),
    canonical: (slug) => `https://www.hackerrank.com/challenges/${slug}/problem`,
  },
  {
    platform: 'interviewbit',
    test: /^https?:\/\/(?:www\.)?interviewbit\.com\/problems\/([a-z0-9-]+)/i,
    slug: (m) => m[1].toLowerCase(),
    canonical: (slug) => `https://www.interviewbit.com/problems/${slug}/`,
  },
  {
    platform: 'codestudio',
    // Naukri Code360 (formerly Coding Ninjas CodeStudio).
    // The trailing _<id> is part of the identity, so underscores are kept.
    test: /^https?:\/\/(?:www\.)?naukri\.com\/code360\/problems\/([a-z0-9_-]+)/i,
    slug: (m) => m[1].toLowerCase(),
    canonical: (slug) => `https://www.naukri.com/code360/problems/${slug}`,
  },
  {
    platform: 'codestudio',
    test: /^https?:\/\/(?:www\.)?codingninjas\.com\/(?:codestudio|studio)\/problems\/([a-z0-9_-]+)/i,
    slug: (m) => m[1].toLowerCase(),
    canonical: (slug) => `https://www.naukri.com/code360/problems/${slug}`,
  },
  {
    platform: 'spoj',
    test: /^https?:\/\/(?:www\.)?spoj\.com\/problems\/([A-Za-z0-9_-]+)/i,
    slug: (m) => m[1].toUpperCase(),
    canonical: (slug) => `https://www.spoj.com/problems/${slug}/`,
  },
  {
    platform: 'hackerearth',
    test: /^https?:\/\/(?:www\.)?hackerearth\.com\/(?:practice|problem)\/[^\s]*?\/([a-z0-9-]+)\/?$/i,
    slug: (m) => m[1].toLowerCase(),
    canonical: (slug) => `https://www.hackerearth.com/practice/${slug}/`,
  },
];

/** Trims whitespace, strips the query string / fragment and any trailing slash. */
function normalizeUrl(raw) {
  let url = String(raw || '').trim();
  if (!url) return '';
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  // Keep the path only; query params like ?envType=study-plan are never identity
  return url.split('#')[0].split('?')[0];
}

/**
 * Parses a problem URL.
 * @param {string} raw
 * @returns {{platform:string, slug:string, canonicalUrl:string, originalUrl:string}|null}
 */
function parseProblemUrl(raw) {
  const url = normalizeUrl(raw);
  if (!url) return null;

  for (const matcher of MATCHERS) {
    const match = url.match(matcher.test);
    if (match) {
      const slug = matcher.slug(match);
      if (!slug) continue;
      return {
        platform: matcher.platform,
        slug,
        canonicalUrl: matcher.canonical(slug),
        originalUrl: url,
      };
    }
  }

  // Unknown host: still trackable, keyed by the full URL so it stays unique
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.replace(/\/+$/, '');
    if (!path || path === '/') return null;
    return {
      platform: 'other',
      slug: `${parsed.hostname}${path}`.toLowerCase(),
      canonicalUrl: url,
      originalUrl: url,
    };
  } catch (_err) {
    return null;
  }
}

/** "longest-substring-without-repeating" -> "Longest Substring Without Repeating" */
function titleFromSlug(slug) {
  return String(slug || '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Normalizes any platform's difficulty wording onto our four-value scale. */
function normalizeDifficulty(value) {
  const text = String(value || '').toLowerCase().trim();
  if (['easy', 'basic', 'school', 'beginner', 'e'].includes(text)) return 'easy';
  if (['medium', 'moderate', 'intermediate', 'm'].includes(text)) return 'medium';
  if (['hard', 'difficult', 'advanced', 'expert', 'h'].includes(text)) return 'hard';
  return 'unrated';
}

/** Codeforces exposes numeric ratings instead of labels. */
function difficultyFromCfRating(rating) {
  if (!rating) return 'unrated';
  if (rating < 1400) return 'easy';
  if (rating < 2000) return 'medium';
  return 'hard';
}

module.exports = {
  PROBLEM_PLATFORMS,
  PLATFORM_LABELS,
  parseProblemUrl,
  normalizeUrl,
  titleFromSlug,
  normalizeDifficulty,
  difficultyFromCfRating,
};
