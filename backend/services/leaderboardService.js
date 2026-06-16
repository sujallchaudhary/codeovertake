const Student = require('../models/Student');
const Snapshot = require('../models/Snapshot');
const { getAllPlatforms } = require('../platforms');

const platforms = getAllPlatforms();

// Build sortBy map and select fields once at startup
const sortByMap = { total: 'scores.total' };
const defaultSelectFields = ['rollno', 'name', 'branch', 'year', 'scores', 'ranks'];
for (const p of platforms) {
  sortByMap[p.key] = `scores.${p.key}`;
}

/**
 * Get paginated leaderboard with optional filters.
 */
async function getLeaderboard({ year, branch, sortBy = 'total', order = 'desc', page = 1, limit = 50, search } = {}) {
  const filter = {};
  if (year) filter.year = parseInt(year);
  if (branch) filter.branch = branch.toUpperCase();
  if (search) {
    filter.$or = [
      { name: { $regex: search, $options: 'i' } },
      { rollno: { $regex: search, $options: 'i' } },
    ];
  }

  const sortField = sortByMap[sortBy] || 'scores.total';
  const sortOrder = order === 'asc' ? 1 : -1;
  const skip = (Math.max(1, parseInt(page)) - 1) * parseInt(limit);
  const lim = Math.min(100, Math.max(1, parseInt(limit)));

  const [students, total] = await Promise.all([
    Student.find(filter)
      .sort({ [sortField]: sortOrder })
      .skip(skip)
      .limit(lim)
      .select(defaultSelectFields.join(' ')),
    Student.countDocuments(filter),
  ]);

  return {
    students,
    pagination: { page: parseInt(page), limit: lim, total, pages: Math.ceil(total / lim) },
  };
}

/**
 * Get platform-specific leaderboard (only students with that platform linked).
 */
async function getPlatformLeaderboard(platformKey, { year, branch, order = 'desc', sortBy, page = 1, limit = 50, search } = {}) {
  const platform = platforms.find((p) => p.key === platformKey);
  const filter = {};
  if (year) filter.year = parseInt(year);
  if (branch) filter.branch = branch.toUpperCase();
  if (platformKey !== 'all') {
    filter[`${platformKey}.username`] = { $ne: '' };
  }
  if (search) {
    filter.$or = [
      { name: { $regex: search, $options: 'i' } },
      { rollno: { $regex: search, $options: 'i' } },
    ];
  }

  // Allow sorting by individual stat fields (e.g. github.stats.publicRepos)
  let sortField;
  if (sortBy && platform) {
    const validHeaders = platform.leaderboardHeaders.map((h) => h.statKey);
    if (validHeaders.includes(sortBy)) {
      sortField = sortBy;
    } else {
      sortField = `scores.${platformKey}`;
    }
  } else {
    sortField = platformKey === 'all' ? 'scores.total' : `scores.${platformKey}`;
  }
  const sortOrder = order === 'asc' ? 1 : -1;
  const skip = (Math.max(1, parseInt(page)) - 1) * parseInt(limit);
  const lim = Math.min(100, Math.max(1, parseInt(limit)));
  const selectFields = platform ? platform.leaderboardFields : defaultSelectFields.join(' ');

  const [students, total] = await Promise.all([
    Student.find(filter)
      .sort({ [sortField]: sortOrder })
      .skip(skip)
      .limit(lim)
      .select(selectFields),
    Student.countDocuments(filter),
  ]);

  // If year/branch filters are active, compute each student's rank within
  // that filtered pool (excluding search). Bounded by page size so this is cheap.
  const hasPoolFilter = year || branch;
  if (hasPoolFilter) {
    const baseFilter = {};
    if (year) baseFilter.year = parseInt(year);
    if (branch) baseFilter.branch = branch.toUpperCase();
    if (platformKey !== 'all') {
      baseFilter[`${platformKey}.username`] = { $ne: '' };
    }
    const scoreField = platformKey === 'all' ? 'scores.total' : `scores.${platformKey}`;

    await Promise.all(
      students.map(async (s) => {
        const score = platformKey === 'all' ? (s.scores?.total ?? 0) : (s.scores?.[platformKey] ?? 0);
        const higherCount = await Student.countDocuments({
          ...baseFilter,
          [scoreField]: { $gt: score },
        });
        s._doc.filteredRank = higherCount + 1;
      })
    );
  }

  return {
    students,
    pagination: { page: parseInt(page), limit: lim, total, pages: Math.ceil(total / lim) },
  };
}

/**
 * Get filter options (years, branches) and platform metadata.
 */
async function getFilters() {
  const [years, branches] = await Promise.all([
    Student.distinct('year'),
    Student.distinct('branch'),
  ]);

  return {
    years: years.sort((a, b) => b - a),
    branches: branches.sort(),
    platforms: platforms.map((p) => ({
      key: p.key,
      label: p.label,
      headers: p.leaderboardHeaders,
      profileStats: p.profileStats || [],
      profileUrl: p.profileUrl ? p.profileUrl('{username}') : null,
    })),
  };
}

/**
 * Get historical leaderboard for a specific date.
 */
async function getHistoricalLeaderboard(dateStr, { year, branch, sortBy = 'total', page = 1, limit = 50 } = {}) {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) {
    const err = new Error('Invalid date format');
    err.statusCode = 400;
    throw err;
  }
  date.setUTCHours(0, 0, 0, 0);

  const pipeline = [
    { $match: { date } },
    {
      $lookup: {
        from: 'students',
        localField: 'rollno',
        foreignField: 'rollno',
        as: 'studentInfo',
      },
    },
    { $unwind: '$studentInfo' },
  ];

  if (year) pipeline.push({ $match: { 'studentInfo.year': parseInt(year) } });
  if (branch) pipeline.push({ $match: { 'studentInfo.branch': branch.toUpperCase() } });

  const sortField = `scores.${sortBy === 'total' ? 'total' : sortBy}`;
  pipeline.push({ $sort: { [sortField]: -1 } });

  const skip = (Math.max(1, parseInt(page)) - 1) * parseInt(limit);
  const lim = Math.min(100, Math.max(1, parseInt(limit)));

  pipeline.push({ $skip: skip }, { $limit: lim });
  pipeline.push({
    $project: {
      rollno: 1,
      scores: 1,
      ranks: 1,
      name: '$studentInfo.name',
      branch: '$studentInfo.branch',
      year: '$studentInfo.year',
    },
  });

  const results = await Snapshot.aggregate(pipeline);
  return { date: date.toISOString().split('T')[0], students: results };
}

/**
 * Get top score gainers by comparing latest two snapshots.
 */
async function getTopGainers({ limit = 50, page = 1, search, branch, year } = {}) {
  // Find the two most recent distinct snapshot dates
  const dates = await Snapshot.aggregate([
    { $group: { _id: '$date' } },
    { $sort: { _id: -1 } },
    { $limit: 2 },
  ]);

  if (dates.length < 2) return { gainers: [], dates: [] };

  const [latestDate, prevDate] = [dates[0]._id, dates[1]._id];

  const pageNum = Number.isFinite(Number(page)) ? Math.max(1, parseInt(page, 10)) : 1;
  const reqLimit = Number.isFinite(Number(limit)) ? parseInt(limit, 10) : 50;
  const lim = Math.min(100, Math.max(1, reqLimit));
  const skip = (pageNum - 1) * lim;

  const pipeline = [
    { $match: { date: { $in: [latestDate, prevDate] } } },
    {
      $group: {
        _id: '$rollno',
        scores: {
          $push: { date: '$date', total: '$scores.total' },
        },
      },
    },
    { $match: { 'scores.1': { $exists: true } } }, // must have both dates
    {
      $project: {
        rollno: '$_id',
        latest: {
          $arrayElemAt: [
            { $filter: { input: '$scores', as: 's', cond: { $eq: ['$$s.date', latestDate] } } },
            0,
          ],
        },
        prev: {
          $arrayElemAt: [
            { $filter: { input: '$scores', as: 's', cond: { $eq: ['$$s.date', prevDate] } } },
            0,
          ],
        },
      },
    },
    {
      $project: {
        rollno: 1,
        gain: { $subtract: ['$latest.total', '$prev.total'] },
        currentScore: '$latest.total',
        previousScore: '$prev.total',
      },
    },
    { $match: { gain: { $gt: 0 } } },
    { $sort: { gain: -1 } },
    {
      $lookup: {
        from: 'students',
        localField: 'rollno',
        foreignField: 'rollno',
        as: 'student',
      },
    },
    { $unwind: '$student' }
  ];

  // Add Branch and Year Filters
  if (year) pipeline.push({ $match: { 'student.year': parseInt(year) } });
  if (branch && !["all", "All Branches"].includes(branch)) {
    pipeline.push({ $match: { 'student.branch': String(branch).toUpperCase() } });
  }

  // Add Search Filter
  if (search) {
    pipeline.push({
      $match: {
        $or: [
          { 'student.name': { $regex: search, $options: 'i' } },
          { rollno: { $regex: search, $options: 'i' } },
        ],
      },
    });
  }

  // Split filtered results into page data plus total count.
  pipeline.push({
    $facet: {
      metadata: [{ $count: 'total' }],
      data: [
        { $skip: skip },
        { $limit: lim },
        {
          $project: {
            rollno: 1,
            gain: 1,
            currentScore: 1,
            previousScore: 1,
            name: '$student.name',
            branch: '$student.branch',
            year: '$student.year',
          },
        },
      ],
    },
  });

  const result = await Snapshot.aggregate(pipeline);
  const gainers = result[0].data;
  const total = result[0].metadata.length > 0 ? result[0].metadata[0].total : 0;

  return {
    gainers,
    pagination: { page: parseInt(page), limit: lim, total, pages: Math.ceil(total / lim) },
    period: {
      from: prevDate.toISOString().split('T')[0],
      to: latestDate.toISOString().split('T')[0],
    },
  };
}

module.exports = {
  getLeaderboard,
  getPlatformLeaderboard,
  getFilters,
  getHistoricalLeaderboard,
  getTopGainers,
};
