const Problem = require('../models/Problem');
const httpError = require('../utils/httpError');
const workspaceService = require('./workspaceService');

/**
 * Company-wise interview kits.
 *
 * Backed by the `companies` tags on the shared Problem catalog, which are
 * populated from GeeksforGeeks' company tags plus the curated seed data in
 * scripts/seedContent.js.
 *
 * Codolio exposes three preparation modes; they map onto the `buckets` field:
 *   all-time  - classics that keep coming back
 *   6-months  - medium-term trend for that company
 *   45-days   - freshest reports
 */
const BUCKETS = ['all-time', '6-months', '45-days'];

const BUCKET_LABELS = {
  'all-time': 'All-Time Favorites',
  '6-months': 'Last 6 Months',
  '45-days': 'Last 45 Days',
};

function escapeRegex(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * All companies that have at least one tagged problem, with per-bucket counts.
 */
async function listCompanies(query = {}) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(200, Math.max(1, parseInt(query.limit, 10) || 60));

  const pipeline = [
    { $match: { 'companies.0': { $exists: true } } },
    { $unwind: '$companies' },
  ];

  if (query.q) {
    pipeline.push({
      $match: { 'companies.name': { $regex: escapeRegex(query.q), $options: 'i' } },
    });
  }

  pipeline.push(
    {
      $group: {
        _id: '$companies.slug',
        name: { $first: '$companies.name' },
        total: { $sum: 1 },
        easy: { $sum: { $cond: [{ $eq: ['$difficulty', 'easy'] }, 1, 0] } },
        medium: { $sum: { $cond: [{ $eq: ['$difficulty', 'medium'] }, 1, 0] } },
        hard: { $sum: { $cond: [{ $eq: ['$difficulty', 'hard'] }, 1, 0] } },
        recent45: {
          $sum: { $cond: [{ $in: ['45-days', '$companies.buckets'] }, 1, 0] },
        },
        recent6m: {
          $sum: { $cond: [{ $in: ['6-months', '$companies.buckets'] }, 1, 0] },
        },
      },
    },
    { $sort: { total: -1, name: 1 } },
    {
      $facet: {
        metadata: [{ $count: 'total' }],
        data: [{ $skip: (page - 1) * limit }, { $limit: limit }],
      },
    },
  );

  const [result] = await Problem.aggregate(pipeline);
  const total = result?.metadata?.[0]?.total || 0;

  return {
    companies: (result?.data || []).map((c) => ({
      slug: c._id,
      name: c.name,
      total: c.total,
      difficulty: { easy: c.easy, medium: c.medium, hard: c.hard },
      recent45: c.recent45,
      recent6m: c.recent6m,
    })),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) || 0 },
    buckets: BUCKETS.map((b) => ({ value: b, label: BUCKET_LABELS[b] })),
  };
}

/**
 * A single company's kit.
 *
 * @param {string} slug
 * @param {Object} query bucket, difficulty, topic, page, limit, sortBy
 * @param {Object|null} user folds the caller's solved/starred state in
 */
async function getCompanyKit(slug, query = {}, user = null) {
  const companySlug = String(slug || '').toLowerCase().trim();
  if (!companySlug) throw httpError(400, 'Company slug is required');

  const bucket = BUCKETS.includes(query.bucket) ? query.bucket : 'all-time';

  const filter = { 'companies.slug': companySlug };
  // 'all-time' means "everything we know about", not a literal bucket match
  if (bucket !== 'all-time') {
    filter.companies = { $elemMatch: { slug: companySlug, buckets: bucket } };
    delete filter['companies.slug'];
  }
  if (query.difficulty && query.difficulty !== 'all') filter.difficulty = query.difficulty;
  if (query.topic) filter.topics = query.topic;

  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 50));

  const sortMap = {
    // `frequency` is projected below from *this* company's tag. Sorting on the
    // raw `companies.frequency` path would rank by whichever tag in the array
    // happens to be highest, which for a problem asked by many companies is not
    // this company's number at all.
    frequency: { frequency: -1, title: 1 },
    difficulty: { difficultyRank: 1, title: 1 },
    title: { title: 1 },
  };
  const sort = sortMap[query.sortBy] || sortMap.frequency;

  const pipeline = [
    { $match: filter },
    {
      $addFields: {
        companyTag: {
          $first: {
            $filter: {
              input: { $ifNull: ['$companies', []] },
              as: 'c',
              cond: { $eq: ['$$c.slug', companySlug] },
            },
          },
        },
        difficultyRank: {
          $switch: {
            branches: [
              { case: { $eq: ['$difficulty', 'easy'] }, then: 1 },
              { case: { $eq: ['$difficulty', 'medium'] }, then: 2 },
              { case: { $eq: ['$difficulty', 'hard'] }, then: 3 },
            ],
            default: 4,
          },
        },
      },
    },
    { $addFields: { frequency: { $ifNull: ['$companyTag.frequency', 0] } } },
    {
      $facet: {
        metadata: [{ $count: 'total' }],
        data: [{ $sort: sort }, { $skip: (page - 1) * limit }, { $limit: limit }],
      },
    },
  ];

  const [[result], companyMeta] = await Promise.all([
    Problem.aggregate(pipeline),
    Problem.findOne({ 'companies.slug': companySlug }, { 'companies.$': 1 }).lean(),
  ]);

  const problems = result?.data || [];
  const total = result?.metadata?.[0]?.total || 0;

  if (!companyMeta) throw httpError(404, 'No interview kit found for that company');

  const progressMap = user
    ? await workspaceService.getProgressForProblems(
      user._id,
      problems.map((p) => p._id),
    )
    : {};

  // Per-bucket totals so the tabs can show counts
  const bucketCounts = {};
  await Promise.all(BUCKETS.map(async (b) => {
    const bucketFilter = b === 'all-time'
      ? { 'companies.slug': companySlug }
      : { companies: { $elemMatch: { slug: companySlug, buckets: b } } };
    bucketCounts[b] = await Problem.countDocuments(bucketFilter);
  }));

  const solvedCount = Object.values(progressMap).filter((p) => p.status === 'solved').length;

  return {
    company: {
      slug: companySlug,
      name: companyMeta.companies?.[0]?.name || companySlug,
    },
    bucket,
    buckets: BUCKETS.map((b) => ({
      value: b, label: BUCKET_LABELS[b], count: bucketCounts[b] || 0,
    })),
    problems: problems.map((p) => {
      const progress = progressMap[String(p._id)] || null;
      return {
        ...p,
        id: String(p._id),
        // `frequency` was projected from this company's own tag in the pipeline
        status: progress?.status || 'unsolved',
        starred: progress?.starred || false,
        trackedQuestionId: progress?.trackedQuestionId || null,
        companyTag: undefined,
        difficultyRank: undefined,
      };
    }),
    progress: {
      solvedOnPage: solvedCount,
      total,
    },
    pagination: { page, limit, total, pages: Math.ceil(total / limit) || 0 },
  };
}

/**
 * Company tags on a single problem, for the problem detail panel.
 */
async function getProblemCompanies(problemId) {
  const problem = await Problem.findById(problemId).select('companies title').lean();
  if (!problem) throw httpError(404, 'Problem not found');
  return {
    companies: (problem.companies || [])
      .slice()
      .sort((a, b) => (b.frequency || 0) - (a.frequency || 0)),
  };
}

module.exports = {
  BUCKETS,
  BUCKET_LABELS,
  listCompanies,
  getCompanyKit,
  getProblemCompanies,
};
