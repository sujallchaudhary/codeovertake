const mongoose = require('mongoose');
const TrackedQuestion = require('../models/TrackedQuestion');
const Problem = require('../models/Problem');
const Note = require('../models/Note');
const User = require('../models/User');
const problemService = require('./problemService');
const httpError = require('../utils/httpError');
const {
  computeMemoryScore,
  initialStateOnSolve,
  averageRetention,
  retentionLabel,
} = require('../utils/spacedRepetition');

const toId = (v) => new mongoose.Types.ObjectId(String(v));

function escapeRegex(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Attaches the derived memory score so the UI can show the retention battery. */
function decorate(doc, now = new Date()) {
  const memoryScore = doc.status === 'solved'
    ? computeMemoryScore(doc.revision || {}, doc.solvedAt, now)
    : 0;
  return {
    ...doc,
    id: String(doc._id),
    memoryScore,
    isDue: Boolean(doc.revision?.dueAt && new Date(doc.revision.dueAt) <= now),
  };
}

/**
 * Adds a question to the workspace.
 *
 * Accepts either a raw `url` (resolved through the catalog, fetching metadata on
 * first sight) or an existing `problemId`. Idempotent: re-adding an existing
 * question returns it instead of erroring, which is what the Chrome extension
 * and sheet interactions rely on.
 *
 * @param {string} userId
 * @param {{url?:string, problemId?:string, source?:string, sheetId?:string,
 *          status?:string, starred?:boolean, tags?:string[]}} data
 */
async function addQuestion(userId, data = {}) {
  let problem;
  if (data.problemId) {
    problem = await Problem.findById(data.problemId);
    if (!problem) throw httpError(404, 'Problem not found');
  } else if (data.url) {
    problem = await problemService.resolveByUrl(data.url);
  } else {
    throw httpError(400, 'Provide either a problem URL or a problemId', [
      { field: 'url', message: 'A problem URL or problemId is required' },
    ]);
  }

  const existing = await TrackedQuestion.findOne({ user: userId, problem: problem._id });
  if (existing) {
    // Merge in any newly supplied tags/star without clobbering existing state
    let touched = false;
    if (Array.isArray(data.tags) && data.tags.length) {
      const merged = new Set([...existing.tags, ...data.tags.map((t) => String(t).trim())]);
      existing.tags = [...merged].filter(Boolean);
      touched = true;
    }
    if (data.starred === true && !existing.starred) {
      existing.starred = true;
      touched = true;
    }
    if (data.status === 'solved' && existing.status !== 'solved') {
      await setStatus(userId, existing._id, 'solved');
      const refreshed = await TrackedQuestion.findById(existing._id).populate('problem').lean();
      return { question: decorate(refreshed), created: false };
    }
    if (touched) await existing.save();

    const populated = await TrackedQuestion.findById(existing._id).populate('problem').lean();
    return { question: decorate(populated), created: false };
  }

  const status = data.status === 'solved' ? 'solved' : 'unsolved';
  const created = await TrackedQuestion.create({
    user: userId,
    problem: problem._id,
    status,
    solvedAt: status === 'solved' ? new Date() : null,
    starred: Boolean(data.starred),
    tags: (data.tags || []).map((t) => String(t).trim()).filter(Boolean),
    source: data.source || 'manual',
    sourceSheet: data.sheetId || null,
    revision: status === 'solved' ? initialStateOnSolve() : {},
  });

  if (status === 'solved') await refreshRetention(userId);

  const populated = await TrackedQuestion.findById(created._id).populate('problem').lean();
  return { question: decorate(populated), created: true };
}

/**
 * Idempotently ensures a problem is tracked, used when a sheet interaction
 * should copy the question into the workspace (Codolio's sheet -> workspace sync).
 * Returns the TrackedQuestion document.
 */
async function ensureTracked(userId, problemId, { source = 'sheet', sheetId = null } = {}) {
  const existing = await TrackedQuestion.findOne({ user: userId, problem: problemId });
  if (existing) return existing;

  try {
    return await TrackedQuestion.create({
      user: userId,
      problem: problemId,
      source,
      sourceSheet: sheetId,
    });
  } catch (err) {
    // Unique index race: another request created it a moment ago
    if (err.code === 11000) {
      return TrackedQuestion.findOne({ user: userId, problem: problemId });
    }
    throw err;
  }
}

/**
 * Paginated, filterable workspace listing.
 *
 * Filters straddle two collections (status/tags/starred live on the tracked doc;
 * difficulty/platform/topic/title live on the problem), so this runs as an
 * aggregation with a $lookup rather than two round trips.
 *
 * @param {string} userId
 * @param {Object} query status, tag, topic, difficulty, platform, starred,
 *                      search, sortBy, order, page, limit
 */
async function listQuestions(userId, query = {}) {
  const match = { user: toId(userId) };

  if (query.status === 'solved' || query.status === 'unsolved') match.status = query.status;
  if (query.starred === 'true' || query.starred === true) match.starred = true;
  if (query.tag) match.tags = query.tag;
  if (query.sheetId) match.sourceSheet = toId(query.sheetId);

  const problemMatch = {};
  if (query.difficulty && query.difficulty !== 'all') problemMatch['problem.difficulty'] = query.difficulty;
  if (query.platform && query.platform !== 'all') problemMatch['problem.platform'] = query.platform;
  if (query.topic) problemMatch['problem.topics'] = query.topic;
  if (query.search) {
    problemMatch['problem.title'] = { $regex: escapeRegex(query.search), $options: 'i' };
  }

  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 25));

  const sortMap = {
    added: { createdAt: -1 },
    title: { 'problem.title': 1 },
    difficulty: { difficultyRank: 1, 'problem.title': 1 },
    due: { 'revision.dueAt': 1 },
    solved: { solvedAt: -1 },
  };
  const sort = sortMap[query.sortBy] || sortMap.added;
  if (query.order === 'asc' && query.sortBy === 'added') sort.createdAt = 1;

  const pipeline = [
    { $match: match },
    {
      $lookup: {
        from: 'problems', localField: 'problem', foreignField: '_id', as: 'problem',
      },
    },
    { $unwind: '$problem' },
    ...(Object.keys(problemMatch).length ? [{ $match: problemMatch }] : []),
    {
      $addFields: {
        difficultyRank: {
          $switch: {
            branches: [
              { case: { $eq: ['$problem.difficulty', 'easy'] }, then: 1 },
              { case: { $eq: ['$problem.difficulty', 'medium'] }, then: 2 },
              { case: { $eq: ['$problem.difficulty', 'hard'] }, then: 3 },
            ],
            default: 4,
          },
        },
      },
    },
    {
      $facet: {
        metadata: [{ $count: 'total' }],
        data: [{ $sort: sort }, { $skip: (page - 1) * limit }, { $limit: limit }],
      },
    },
  ];

  const [result] = await TrackedQuestion.aggregate(pipeline);
  const total = result?.metadata?.[0]?.total || 0;
  const now = new Date();

  return {
    questions: (result?.data || []).map((d) => decorate(d, now)),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) || 0 },
  };
}

/**
 * Single question detail, including every note linked to its problem — which is
 * how a note written on one question surfaces on all the others it links to.
 */
async function getQuestion(userId, questionId) {
  const question = await TrackedQuestion.findOne({ _id: questionId, user: userId })
    .populate('problem')
    .populate('sourceSheet', 'title slug')
    .lean();
  if (!question) throw httpError(404, 'Question not found in your workspace');

  const notes = await Note.find({ user: userId, linkedProblems: question.problem._id })
    .sort({ pinned: -1, updatedAt: -1 })
    .lean();

  return { question: decorate(question), notes };
}

/** Marks solved/unsolved, seeding or clearing the revision schedule to match. */
async function setStatus(userId, questionId, status) {
  if (!['solved', 'unsolved'].includes(status)) {
    throw httpError(400, 'status must be "solved" or "unsolved"');
  }

  const question = await TrackedQuestion.findOne({ _id: questionId, user: userId });
  if (!question) throw httpError(404, 'Question not found in your workspace');

  if (question.status !== status) {
    question.status = status;
    if (status === 'solved') {
      question.solvedAt = new Date();
      // Only seed a fresh schedule if it has never been revised
      if (!question.revision?.lastRevisedAt) {
        question.revision = initialStateOnSolve();
      }
    } else {
      question.solvedAt = null;
      // Unsolving takes it out of the revision rotation entirely
      question.revision = {
        repetitions: 0,
        intervalDays: 0,
        easeFactor: 2.5,
        stabilityDays: 0,
        lastRating: null,
        lastRevisedAt: null,
        dueAt: null,
        reviewCount: 0,
      };
    }
    await question.save();
    await refreshRetention(userId);
  }

  const populated = await TrackedQuestion.findById(question._id).populate('problem').lean();
  return { question: decorate(populated) };
}

/** Partial update for star / tags. */
async function updateQuestion(userId, questionId, data = {}) {
  const question = await TrackedQuestion.findOne({ _id: questionId, user: userId });
  if (!question) throw httpError(404, 'Question not found in your workspace');

  if (data.starred !== undefined) question.starred = Boolean(data.starred);
  if (data.tags !== undefined) {
    if (!Array.isArray(data.tags)) {
      throw httpError(400, 'tags must be an array of strings');
    }
    const cleaned = data.tags
      .map((t) => String(t).trim())
      .filter(Boolean)
      .slice(0, 25);
    question.tags = [...new Set(cleaned)];
  }
  await question.save();

  if (data.status !== undefined && data.status !== question.status) {
    return setStatus(userId, questionId, data.status);
  }

  const populated = await TrackedQuestion.findById(question._id).populate('problem').lean();
  return { question: decorate(populated) };
}

async function removeQuestion(userId, questionId) {
  const deleted = await TrackedQuestion.findOneAndDelete({ _id: questionId, user: userId });
  if (!deleted) throw httpError(404, 'Question not found in your workspace');
  await refreshRetention(userId);
  return { message: 'Removed from workspace', id: String(questionId) };
}

/** Distinct custom tags with usage counts, for the filter bar. */
async function listTags(userId) {
  const rows = await TrackedQuestion.aggregate([
    { $match: { user: toId(userId) } },
    { $unwind: '$tags' },
    { $group: { _id: '$tags', count: { $sum: 1 } } },
    { $sort: { count: -1, _id: 1 } },
    { $limit: 100 },
  ]);
  return { tags: rows.map((r) => ({ name: r._id, count: r.count })) };
}

/**
 * Recomputes and persists the user's Retention Rating (mean memory battery
 * across every solved question). Called after anything that changes the solved
 * set or a revision.
 */
async function refreshRetention(userId) {
  const solved = await TrackedQuestion.find({ user: userId, status: 'solved' })
    .select('revision solvedAt')
    .lean();

  const now = new Date();
  const scores = solved.map((q) => computeMemoryScore(q.revision || {}, q.solvedAt, now));
  const rating = averageRetention(scores);

  await User.updateOne(
    { _id: userId },
    { $set: { 'revision.retentionRating': rating, 'revision.retentionUpdatedAt': now } },
  );
  return rating;
}

/**
 * Dashboard counters for the workspace header: totals, difficulty split,
 * per-platform split, top topics and the current retention reading.
 */
async function getStats(userId) {
  const uid = toId(userId);

  const [counts, byDifficulty, byPlatform, byTopic, user, starred] = await Promise.all([
    TrackedQuestion.aggregate([
      { $match: { user: uid } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    TrackedQuestion.aggregate([
      { $match: { user: uid } },
      { $lookup: { from: 'problems', localField: 'problem', foreignField: '_id', as: 'p' } },
      { $unwind: '$p' },
      {
        $group: {
          _id: '$p.difficulty',
          total: { $sum: 1 },
          solved: { $sum: { $cond: [{ $eq: ['$status', 'solved'] }, 1, 0] } },
        },
      },
    ]),
    TrackedQuestion.aggregate([
      { $match: { user: uid } },
      { $lookup: { from: 'problems', localField: 'problem', foreignField: '_id', as: 'p' } },
      { $unwind: '$p' },
      {
        $group: {
          _id: '$p.platform',
          total: { $sum: 1 },
          solved: { $sum: { $cond: [{ $eq: ['$status', 'solved'] }, 1, 0] } },
        },
      },
      { $sort: { total: -1 } },
    ]),
    TrackedQuestion.aggregate([
      { $match: { user: uid } },
      { $lookup: { from: 'problems', localField: 'problem', foreignField: '_id', as: 'p' } },
      { $unwind: '$p' },
      { $unwind: '$p.topics' },
      {
        $group: {
          _id: '$p.topics',
          total: { $sum: 1 },
          solved: { $sum: { $cond: [{ $eq: ['$status', 'solved'] }, 1, 0] } },
        },
      },
      { $sort: { total: -1 } },
      { $limit: 15 },
    ]),
    User.findById(userId).select('revision').lean(),
    TrackedQuestion.countDocuments({ user: uid, starred: true }),
  ]);

  const statusMap = counts.reduce((acc, c) => { acc[c._id] = c.count; return acc; }, {});
  const solvedCount = statusMap.solved || 0;
  const total = (statusMap.solved || 0) + (statusMap.unsolved || 0);

  const difficulty = { easy: 0, medium: 0, hard: 0, unrated: 0 };
  const difficultySolved = { easy: 0, medium: 0, hard: 0, unrated: 0 };
  for (const row of byDifficulty) {
    difficulty[row._id] = row.total;
    difficultySolved[row._id] = row.solved;
  }

  const retentionRating = user?.revision?.retentionRating || 0;

  return {
    total,
    solved: solvedCount,
    unsolved: statusMap.unsolved || 0,
    starred,
    difficulty,
    difficultySolved,
    platforms: byPlatform.map((p) => ({ platform: p._id, total: p.total, solved: p.solved })),
    topics: byTopic.map((t) => ({ topic: t._id, total: t.total, solved: t.solved })),
    retention: {
      rating: retentionRating,
      label: retentionLabel(retentionRating),
      streak: user?.revision?.streak || 0,
      longestStreak: user?.revision?.longestStreak || 0,
      totalRevisions: user?.revision?.totalRevisions || 0,
    },
  };
}

/**
 * Bulk-adds many problems (used when following a sheet or importing).
 * @param {string} userId
 * @param {string[]} problemIds
 */
async function addManyProblems(userId, problemIds, { source = 'sheet', sheetId = null } = {}) {
  if (!problemIds.length) return { added: 0 };

  const existing = await TrackedQuestion.find({ user: userId, problem: { $in: problemIds } })
    .select('problem')
    .lean();
  const have = new Set(existing.map((e) => String(e.problem)));
  const toInsert = problemIds
    .filter((id) => !have.has(String(id)))
    .map((id) => ({
      user: userId, problem: id, source, sourceSheet: sheetId,
    }));

  if (!toInsert.length) return { added: 0 };
  // ordered:false so a concurrent duplicate does not abort the batch
  const res = await TrackedQuestion.insertMany(toInsert, { ordered: false })
    .catch((err) => {
      if (err.code === 11000) return err.insertedDocs || [];
      throw err;
    });
  return { added: Array.isArray(res) ? res.length : 0 };
}

/**
 * Map of problemId -> { status, starred, tags } for a set of problems, so sheet
 * and company-kit views can render the user's progress inline.
 */
async function getProgressForProblems(userId, problemIds) {
  if (!userId || !problemIds.length) return {};
  const rows = await TrackedQuestion.find({ user: userId, problem: { $in: problemIds } })
    .select('problem status starred tags revision solvedAt')
    .lean();

  const now = new Date();
  return rows.reduce((acc, r) => {
    acc[String(r.problem)] = {
      trackedQuestionId: String(r._id),
      status: r.status,
      starred: r.starred,
      tags: r.tags,
      memoryScore: r.status === 'solved'
        ? computeMemoryScore(r.revision || {}, r.solvedAt, now)
        : 0,
    };
    return acc;
  }, {});
}

module.exports = {
  addQuestion,
  ensureTracked,
  listQuestions,
  getQuestion,
  setStatus,
  updateQuestion,
  removeQuestion,
  listTags,
  getStats,
  refreshRetention,
  addManyProblems,
  getProgressForProblems,
  decorate,
};
