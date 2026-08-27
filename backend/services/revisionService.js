const mongoose = require('mongoose');
const TrackedQuestion = require('../models/TrackedQuestion');
const RevisionLog = require('../models/RevisionLog');
const RevisionQueue = require('../models/RevisionQueue');
const User = require('../models/User');
const httpError = require('../utils/httpError');
const workspaceService = require('./workspaceService');
const {
  RATING_CONFIG,
  RATINGS,
  dateKey,
  computeMemoryScore,
  scheduleNext,
  retentionLabel,
} = require('../utils/spacedRepetition');

/** Codolio serves at most 5 questions a day... */
const QUEUE_SIZE = 5;
/** ...and only once the algorithm has enough history to work with. */
const UNLOCK_THRESHOLD = 20;

const toId = (v) => new mongoose.Types.ObjectId(String(v));

/**
 * Builds (or returns the already-built) queue for today.
 *
 * Selection = the solved questions whose memory battery has drained the most,
 * i.e. the ones the user is closest to forgetting. The result is persisted so
 * the list is stable until midnight instead of reshuffling through the day.
 */
async function getDailyQueue(userId) {
  const today = dateKey();

  const solvedCount = await TrackedQuestion.countDocuments({ user: userId, status: 'solved' });
  if (solvedCount < UNLOCK_THRESHOLD) {
    return {
      locked: true,
      unlockAt: UNLOCK_THRESHOLD,
      solvedCount,
      remaining: UNLOCK_THRESHOLD - solvedCount,
      dateKey: today,
      items: [],
      queueSize: QUEUE_SIZE,
    };
  }

  let queue = await RevisionQueue.findOne({ user: userId, dateKey: today });

  if (!queue) {
    const candidates = await TrackedQuestion.find({ user: userId, status: 'solved' })
      .select('problem revision solvedAt')
      .lean();

    const now = new Date();
    const ranked = candidates
      .map((q) => ({
        trackedQuestion: q._id,
        problem: q.problem,
        memoryScoreAtBuild: computeMemoryScore(q.revision || {}, q.solvedAt, now),
        dueAt: q.revision?.dueAt ? new Date(q.revision.dueAt) : null,
      }))
      // Weakest memory first; ties broken by whichever is due soonest
      .sort((a, b) => (
        a.memoryScoreAtBuild - b.memoryScoreAtBuild
        || (a.dueAt?.getTime() || Infinity) - (b.dueAt?.getTime() || Infinity)
      ))
      .slice(0, QUEUE_SIZE)
      .map(({ trackedQuestion, problem, memoryScoreAtBuild }) => ({
        trackedQuestion, problem, memoryScoreAtBuild, done: false, rating: null,
      }));

    try {
      queue = await RevisionQueue.create({ user: userId, dateKey: today, items: ranked });
    } catch (err) {
      // Unique (user, dateKey) race — another request built it first
      if (err.code === 11000) {
        queue = await RevisionQueue.findOne({ user: userId, dateKey: today });
      } else {
        throw err;
      }
    }
  }

  const populated = await RevisionQueue.findById(queue._id)
    .populate('items.problem', 'title platform difficulty url slug topics')
    .lean();

  const items = populated.items || [];
  const doneCount = items.filter((i) => i.done).length;

  return {
    locked: false,
    dateKey: today,
    queueSize: QUEUE_SIZE,
    solvedCount,
    items: items.map((i) => ({
      trackedQuestionId: String(i.trackedQuestion),
      problem: i.problem,
      memoryScoreAtBuild: i.memoryScoreAtBuild,
      done: i.done,
      rating: i.rating,
    })),
    doneCount,
    total: items.length,
    completed: Boolean(populated.completedAt) || (items.length > 0 && doneCount === items.length),
    ratings: RATINGS.map((r) => ({ value: r, label: RATING_CONFIG[r].label })),
  };
}

/**
 * Recomputes the revision streak from the completed-queue history.
 * A day counts only when the user finished that day's whole queue.
 */
async function updateStreak(userId) {
  const completed = await RevisionQueue.find({ user: userId, completedAt: { $ne: null } })
    .select('dateKey')
    .sort({ dateKey: -1 })
    .limit(400)
    .lean();

  const days = new Set(completed.map((c) => c.dateKey));
  if (!days.size) return { streak: 0, longestStreak: 0, lastRevisionDate: '' };

  // Walk backwards from today (or yesterday, if today is not done yet)
  let cursor = new Date();
  if (!days.has(dateKey(cursor))) {
    cursor = new Date(cursor.getTime() - 864e5);
  }
  let streak = 0;
  while (days.has(dateKey(cursor))) {
    streak += 1;
    cursor = new Date(cursor.getTime() - 864e5);
  }

  // Longest run anywhere in the history
  const sorted = [...days].sort();
  let longest = 0;
  let run = 0;
  let prev = null;
  for (const key of sorted) {
    if (prev && new Date(key).getTime() - new Date(prev).getTime() === 864e5) run += 1;
    else run = 1;
    longest = Math.max(longest, run);
    prev = key;
  }

  const user = await User.findById(userId).select('revision').lean();
  const longestStreak = Math.max(longest, user?.revision?.longestStreak || 0);

  await User.updateOne({ _id: userId }, {
    $set: {
      'revision.streak': streak,
      'revision.longestStreak': longestStreak,
      'revision.lastRevisionDate': sorted[sorted.length - 1],
    },
  });

  return { streak, longestStreak, lastRevisionDate: sorted[sorted.length - 1] };
}

/**
 * Records a revision: reschedules the question, logs it, ticks off the daily
 * queue item and refreshes the streak + Retention Rating.
 *
 * @param {string} userId
 * @param {string} trackedQuestionId
 * @param {string} rating one of struggled | tough | got-it | nailed-it
 */
async function rateQuestion(userId, trackedQuestionId, rating) {
  if (!RATINGS.includes(rating)) {
    throw httpError(400, `rating must be one of: ${RATINGS.join(', ')}`, [
      { field: 'rating', message: `Must be one of ${RATINGS.join(', ')}` },
    ]);
  }

  const question = await TrackedQuestion.findOne({ _id: trackedQuestionId, user: userId });
  if (!question) throw httpError(404, 'Question not found in your workspace');
  if (question.status !== 'solved') {
    throw httpError(400, 'Only solved questions can be revised');
  }

  const now = new Date();
  const before = question.revision?.toObject
    ? question.revision.toObject()
    : { ...(question.revision || {}) };
  const memoryScoreBefore = computeMemoryScore(before, question.solvedAt, now);

  const next = scheduleNext(before, rating, now);
  question.revision = next;
  await question.save();

  await RevisionLog.create({
    user: userId,
    problem: question.problem,
    trackedQuestion: question._id,
    rating,
    dateKey: dateKey(now),
    intervalBefore: before.intervalDays || 0,
    intervalAfter: next.intervalDays,
    memoryScoreBefore,
  });

  await User.updateOne({ _id: userId }, { $inc: { 'revision.totalRevisions': 1 } });

  // Tick the item off today's queue if it was part of it
  const queue = await RevisionQueue.findOne({ user: userId, dateKey: dateKey(now) });
  let queueCompletedNow = false;
  if (queue) {
    const item = queue.items.find((i) => String(i.trackedQuestion) === String(question._id));
    if (item && !item.done) {
      item.done = true;
      item.rating = rating;
    }
    if (!queue.completedAt && queue.items.length > 0 && queue.items.every((i) => i.done)) {
      queue.completedAt = now;
      queueCompletedNow = true;
    }
    await queue.save();
  }

  const [retentionRating, streakInfo] = await Promise.all([
    workspaceService.refreshRetention(userId),
    queueCompletedNow ? updateStreak(userId) : Promise.resolve(null),
  ]);

  return {
    question: {
      id: String(question._id),
      revision: next,
      memoryScore: computeMemoryScore(next, question.solvedAt, now),
    },
    nextReviewInDays: next.intervalDays,
    nextReviewAt: next.dueAt,
    retention: { rating: retentionRating, label: retentionLabel(retentionRating) },
    queueCompleted: queueCompletedNow,
    streak: streakInfo?.streak,
  };
}

/**
 * Retention dashboard: rating, streak, due counts, a revision heatmap and the
 * projected decay curve for the next four weeks.
 */
async function getRevisionStats(userId) {
  const uid = toId(userId);
  const now = new Date();

  const [solved, user, logs, todayQueue] = await Promise.all([
    TrackedQuestion.find({ user: uid, status: 'solved' }).select('revision solvedAt').lean(),
    User.findById(userId).select('revision').lean(),
    RevisionLog.aggregate([
      { $match: { user: uid } },
      { $group: { _id: '$dateKey', count: { $sum: 1 } } },
      { $sort: { _id: -1 } },
      { $limit: 365 },
    ]),
    RevisionQueue.findOne({ user: uid, dateKey: dateKey(now) }).lean(),
  ]);

  const scores = solved.map((q) => computeMemoryScore(q.revision || {}, q.solvedAt, now));
  const rating = user?.revision?.retentionRating
    ?? (scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0);

  // Buckets for the "how much is at risk" breakdown
  const buckets = { strong: 0, fading: 0, weak: 0, critical: 0 };
  for (const s of scores) {
    if (s >= 70) buckets.strong += 1;
    else if (s >= 50) buckets.fading += 1;
    else if (s >= 25) buckets.weak += 1;
    else buckets.critical += 1;
  }

  const dueNow = solved.filter(
    (q) => q.revision?.dueAt && new Date(q.revision.dueAt) <= now,
  ).length;

  // Projected average retention if the user revises nothing from here
  const forecast = [0, 7, 14, 21, 28].map((days) => {
    const future = new Date(now.getTime() + days * 864e5);
    const futureScores = solved.map(
      (q) => computeMemoryScore(q.revision || {}, q.solvedAt, future),
    );
    return {
      days,
      rating: futureScores.length
        ? Math.round(futureScores.reduce((a, b) => a + b, 0) / futureScores.length)
        : 0,
    };
  });

  return {
    retention: {
      rating,
      label: retentionLabel(rating),
      solvedTracked: solved.length,
      buckets,
    },
    streak: user?.revision?.streak || 0,
    longestStreak: user?.revision?.longestStreak || 0,
    totalRevisions: user?.revision?.totalRevisions || 0,
    dueNow,
    todayCompleted: Boolean(todayQueue?.completedAt),
    todayDone: (todayQueue?.items || []).filter((i) => i.done).length,
    heatmap: logs.reduce((acc, l) => { acc[l._id] = l.count; return acc; }, {}),
    forecast,
  };
}

/** Recent revision activity feed. */
async function getRecentRevisions(userId, limit = 20) {
  const logs = await RevisionLog.find({ user: userId })
    .sort({ createdAt: -1 })
    .limit(Math.min(100, Math.max(1, limit)))
    .populate('problem', 'title platform difficulty url slug')
    .lean();
  return { revisions: logs };
}

/** Questions that are due but not necessarily in today's capped queue. */
async function getDueQuestions(userId, limit = 50) {
  const rows = await TrackedQuestion.find({
    user: userId,
    status: 'solved',
    'revision.dueAt': { $lte: new Date() },
  })
    .sort({ 'revision.dueAt': 1 })
    .limit(Math.min(200, Math.max(1, limit)))
    .populate('problem', 'title platform difficulty url slug topics')
    .lean();

  const now = new Date();
  return {
    questions: rows.map((q) => ({
      ...q,
      id: String(q._id),
      memoryScore: computeMemoryScore(q.revision || {}, q.solvedAt, now),
    })),
  };
}

module.exports = {
  QUEUE_SIZE,
  UNLOCK_THRESHOLD,
  getDailyQueue,
  rateQuestion,
  getRevisionStats,
  getRecentRevisions,
  getDueQuestions,
  updateStreak,
};
