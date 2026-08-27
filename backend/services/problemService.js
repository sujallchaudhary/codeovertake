const Problem = require('../models/Problem');
const httpError = require('../utils/httpError');
const { processQueue } = require('../utils/concurrency');
const {
  parseProblemUrl,
  PROBLEM_PLATFORMS,
  PLATFORM_LABELS,
} = require('../utils/problemUrl');
const {
  fetchProblemMetadata,
  searchLeetcodeProblems,
  listAllCodeforcesProblems,
} = require('../problems/metadata');

// Re-enrich metadata at most once a month; problem titles rarely change.
const METADATA_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function escapeRegex(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function slugifyCompany(name) {
  return String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/**
 * Resolves a problem URL into a catalog row, creating it (with fetched
 * metadata) the first time anyone tracks it.
 *
 * This is the shared entry point for the workspace "+" button, sheet imports
 * and the Chrome extension.
 *
 * @param {string} url
 * @param {{refresh?:boolean}} options
 */
async function resolveByUrl(url, options = {}) {
  const ref = parseProblemUrl(url);
  if (!ref) {
    throw httpError(400, 'Could not recognise that problem URL', [
      { field: 'url', message: 'Paste a full problem link, e.g. https://leetcode.com/problems/two-sum/' },
    ]);
  }

  let problem = await Problem.findOne({ platform: ref.platform, slug: ref.slug });

  const isStale = problem
    && (!problem.metadataFetchedAt
      || Date.now() - problem.metadataFetchedAt.getTime() > METADATA_TTL_MS);

  if (problem && !options.refresh && !isStale) return problem;

  const meta = await fetchProblemMetadata(ref);

  const update = {
    platform: ref.platform,
    slug: ref.slug,
    title: meta.title,
    url: ref.canonicalUrl,
    difficulty: meta.difficulty,
    topics: meta.topics || [],
    // Only stamp the TTL when we actually got real data back
    metadataFetchedAt: meta.partial ? null : new Date(),
  };
  if (meta.rating !== undefined) update.rating = meta.rating;
  if (meta.externalId !== undefined) update.externalId = meta.externalId;
  if (meta.isPremium !== undefined) update.isPremium = meta.isPremium;
  if (meta.acceptanceRate !== undefined) update.acceptanceRate = meta.acceptanceRate;

  if (!problem) {
    problem = await Problem.create(update);
  } else {
    // Never downgrade good stored data with a partial re-fetch
    if (meta.partial) {
      delete update.title;
      if (update.difficulty === 'unrated') delete update.difficulty;
      if (!update.topics.length) delete update.topics;
    }
    Object.assign(problem, update);
    await problem.save();
  }

  // GFG hands us company tags for free — fold them into the kits
  if (meta.companyTags?.length) {
    await attachCompanyTags(problem, meta.companyTags);
  }

  return problem;
}

/**
 * Adds/refreshes company tags on a problem without duplicating existing ones.
 * @param {import('mongoose').Document} problem
 * @param {string[]} companyNames
 */
async function attachCompanyTags(problem, companyNames, bucket = 'all-time') {
  const existing = new Map(problem.companies.map((c) => [c.slug, c]));
  let changed = false;

  for (const name of companyNames) {
    const slug = slugifyCompany(name);
    if (!slug) continue;
    const current = existing.get(slug);
    if (current) {
      if (!current.buckets.includes(bucket)) {
        current.buckets.push(bucket);
        changed = true;
      }
    } else {
      problem.companies.push({
        name: String(name).trim(),
        slug,
        frequency: 1,
        buckets: [bucket],
        lastAskedAt: null,
      });
      existing.set(slug, problem.companies[problem.companies.length - 1]);
      changed = true;
    }
  }

  if (changed) await problem.save();
  return problem;
}

/**
 * Resolves many URLs at once (bulk sheet import). Bounded concurrency keeps us
 * from hammering the platforms; failures are reported per row rather than
 * aborting the whole import.
 *
 * @param {string[]} urls
 * @returns {Promise<{problems:Array, failures:Array<{url:string,message:string}>}>}
 */
async function resolveMany(urls) {
  const unique = [...new Set(urls.map((u) => String(u || '').trim()).filter(Boolean))];

  const results = await processQueue(
    unique.map((url) => () => resolveByUrl(url)),
    4,
    120,
  );

  const problems = [];
  const failures = [];
  results.forEach((r, i) => {
    if (r.status === 'fulfilled' && r.value) problems.push(r.value);
    else failures.push({ url: unique[i], message: r.reason?.message || 'Could not resolve' });
  });

  return { problems, failures };
}

/**
 * Search used by the "add question by name" flow.
 *
 * Looks in the local catalog first, then tops up from LeetCode's live problem
 * list (persisting what it finds) so the catalog warms itself over time.
 */
async function searchProblems(query = {}) {
  const q = String(query.q || '').trim();
  const limit = Math.min(50, Math.max(1, parseInt(query.limit, 10) || 15));

  const filter = {};
  if (query.platform && query.platform !== 'all') filter.platform = query.platform;
  if (query.difficulty && query.difficulty !== 'all') filter.difficulty = query.difficulty;
  if (query.topic) filter.topics = query.topic;
  if (q) filter.title = { $regex: escapeRegex(q), $options: 'i' };

  const local = await Problem.find(filter)
    .sort(q ? { title: 1 } : { createdAt: -1 })
    .limit(limit)
    .lean();

  const shouldTopUp = q.length >= 2
    && local.length < limit
    && (!query.platform || query.platform === 'all' || query.platform === 'leetcode');

  if (!shouldTopUp) return { problems: local, source: 'local' };

  const remote = await searchLeetcodeProblems(q, limit);
  if (!remote.problems.length) return { problems: local, source: 'local' };

  // Persist newly discovered problems so the next search is a local hit
  const ops = remote.problems.map((p) => ({
    updateOne: {
      filter: { platform: p.platform, slug: p.slug },
      update: {
        $set: {
          ...p,
          metadataFetchedAt: new Date(),
        },
      },
      upsert: true,
    },
  }));
  if (ops.length) {
    await Problem.bulkWrite(ops, { ordered: false }).catch((err) => {
      console.error('[PROBLEM SEARCH] catalog upsert failed:', err.message);
    });
  }

  const seen = new Set(local.map((p) => `${p.platform}:${p.slug}`));
  const merged = [...local];
  for (const p of remote.problems) {
    if (merged.length >= limit) break;
    if (seen.has(`${p.platform}:${p.slug}`)) continue;
    // Re-read so the caller always gets a real _id to reference
    // eslint-disable-next-line no-await-in-loop
    const saved = await Problem.findOne({ platform: p.platform, slug: p.slug }).lean();
    if (saved) merged.push(saved);
  }

  return { problems: merged, source: 'merged' };
}

async function getProblemById(id) {
  const problem = await Problem.findById(id).lean();
  if (!problem) throw httpError(404, 'Problem not found');
  return { problem };
}

/** Distinct topic list for the workspace/sheet filter dropdowns. */
async function listTopics() {
  const topics = await Problem.distinct('topics');
  return { topics: topics.filter(Boolean).sort((a, b) => a.localeCompare(b)) };
}

/** Static platform metadata so the frontend never hardcodes the list. */
function listPlatforms() {
  return { platforms: PROBLEM_PLATFORMS, labels: PLATFORM_LABELS };
}

/**
 * Bulk catalog upsert, used by the seeding scripts.
 * @param {Array<Object>} rows catalog-shaped rows (platform, slug, title, url, ...)
 */
async function upsertProblems(rows) {
  if (!rows.length) return { upserted: 0 };
  const ops = rows.map((row) => ({
    updateOne: {
      filter: { platform: row.platform, slug: row.slug },
      update: { $set: { ...row, metadataFetchedAt: new Date() } },
      upsert: true,
    },
  }));

  let upserted = 0;
  // Chunk so a huge seed does not build one enormous bulk payload
  for (let i = 0; i < ops.length; i += 500) {
    // eslint-disable-next-line no-await-in-loop
    const res = await Problem.bulkWrite(ops.slice(i, i + 500), { ordered: false });
    upserted += (res.upsertedCount || 0) + (res.modifiedCount || 0);
  }
  return { upserted };
}

/** Seeds the whole Codeforces problemset into the catalog. */
async function seedCodeforcesCatalog() {
  const rows = await listAllCodeforcesProblems();
  return upsertProblems(rows);
}

/** Seeds LeetCode problems page by page. */
async function seedLeetcodeCatalog(maxProblems = 4000) {
  let skip = 0;
  let total = 0;
  const pageSize = 100;

  for (;;) {
    // eslint-disable-next-line no-await-in-loop
    const page = await searchLeetcodeProblems('', pageSize, skip);
    if (!page.problems.length) break;
    // eslint-disable-next-line no-await-in-loop
    const { upserted } = await upsertProblems(page.problems);
    total += upserted;
    skip += pageSize;
    if (skip >= Math.min(maxProblems, page.total || maxProblems)) break;
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  return { upserted: total };
}

module.exports = {
  resolveByUrl,
  resolveMany,
  attachCompanyTags,
  searchProblems,
  getProblemById,
  listTopics,
  listPlatforms,
  upsertProblems,
  seedCodeforcesCatalog,
  seedLeetcodeCatalog,
  slugifyCompany,
};
