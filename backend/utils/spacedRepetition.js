/**
 * Spaced repetition core.
 *
 * Pure functions only — no DB access — so both the workspace (which needs to
 * display memory scores) and the revision engine (which needs to reschedule)
 * can share exactly the same maths.
 *
 * Two ideas drive everything:
 *
 *  1. Scheduling (SM-2 derived). Each confidence rating adjusts an ease factor
 *     and stretches or collapses the review interval. Confident answers push the
 *     next review further out; struggling snaps it back to tomorrow.
 *
 *  2. Memory decay ("battery"). Retention for a single question is modelled as
 *     exponential decay, exp(-daysSince / stability). `stability` grows with
 *     each confident repetition, so a well-known question drains slowly while a
 *     shaky one fades within days. The Retention Rating is the mean battery
 *     level across everything the user has solved.
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const MIN_EASE = 1.3;
const MAX_EASE = 3.0;
const MAX_INTERVAL_DAYS = 365;

/** Questions solved but never revised start with a modest assumed stability. */
const UNREVISED_STABILITY_DAYS = 7;

/**
 * Per-rating tuning.
 *   easeDelta      - adjustment applied to the ease factor
 *   baseStability  - days of memory half-life granted by this rating
 *   intervalFactor - fixed multiplier on the previous interval (null = use ease)
 *   bonus          - extra multiplier applied on top of the ease-based interval
 *   resets         - true collapses the schedule back to "review tomorrow"
 *   firstInterval  - interval (days) to use on the very first successful review
 */
const RATING_CONFIG = {
  struggled: {
    label: 'Struggled', easeDelta: -0.30, baseStability: 3, intervalFactor: 0.2, resets: true, firstInterval: 1,
  },
  tough: {
    label: 'Tough', easeDelta: -0.15, baseStability: 5, intervalFactor: 1.2, resets: false, firstInterval: 2,
  },
  'got-it': {
    label: 'Got it', easeDelta: 0, baseStability: 9, intervalFactor: null, resets: false, firstInterval: 3,
  },
  'nailed-it': {
    label: 'Nailed it', easeDelta: 0.15, baseStability: 16, intervalFactor: null, bonus: 1.15, resets: false, firstInterval: 5,
  },
};

const RATINGS = Object.keys(RATING_CONFIG);

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/** YYYY-MM-DD for the given date, in UTC (matches how snapshots key days). */
function dateKey(date = new Date()) {
  return new Date(date).toISOString().slice(0, 10);
}

/** Midnight UTC of the given date. */
function startOfDay(date = new Date()) {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function addDays(date, days) {
  return new Date(new Date(date).getTime() + days * MS_PER_DAY);
}

/**
 * Retention for one question, 0-100.
 *
 * @param {Object} revision  TrackedQuestion.revision sub-document
 * @param {Date|null} solvedAt anchor for questions solved but never revised
 * @param {Date} now
 * @returns {number} 0-100, where 100 means "just revised"
 */
function computeMemoryScore(revision = {}, solvedAt = null, now = new Date()) {
  const anchor = revision.lastRevisedAt || solvedAt;
  // Never solved and never revised: nothing to retain yet
  if (!anchor) return 0;

  const stability = revision.stabilityDays > 0
    ? revision.stabilityDays
    : UNREVISED_STABILITY_DAYS;

  const daysSince = Math.max(0, (now.getTime() - new Date(anchor).getTime()) / MS_PER_DAY);
  const score = 100 * Math.exp(-daysSince / stability);
  return Math.round(clamp(score, 0, 100));
}

/**
 * Applies a confidence rating and returns the next scheduling state.
 * Does not mutate the input.
 *
 * @param {Object} revision current TrackedQuestion.revision
 * @param {string} rating one of RATINGS
 * @param {Date} now
 * @returns {Object} the new revision sub-document values
 */
function scheduleNext(revision = {}, rating, now = new Date()) {
  const config = RATING_CONFIG[rating];
  if (!config) throw new Error(`Unknown revision rating: ${rating}`);

  const prevInterval = revision.intervalDays || 0;
  const prevReps = revision.repetitions || 0;

  const easeFactor = clamp(
    (revision.easeFactor || 2.5) + config.easeDelta,
    MIN_EASE,
    MAX_EASE,
  );

  const repetitions = config.resets ? 0 : prevReps + 1;

  let intervalDays;
  if (config.resets) {
    // Back to square one: see it again tomorrow
    intervalDays = 1;
  } else if (prevInterval <= 0) {
    intervalDays = config.firstInterval;
  } else if (config.intervalFactor !== null) {
    // Guarantee forward progress: a small multiplier on a small interval would
    // otherwise round back to the same number and stall the schedule forever.
    intervalDays = Math.max(
      prevInterval + 1,
      Math.round(prevInterval * config.intervalFactor),
    );
  } else {
    intervalDays = Math.max(
      prevInterval + 1,
      Math.round(prevInterval * easeFactor * (config.bonus || 1)),
    );
  }
  intervalDays = clamp(Math.max(1, intervalDays), 1, MAX_INTERVAL_DAYS);

  // Stability grows with consecutive confident repetitions and with ease
  const stabilityDays = Number(
    (config.baseStability * (1 + 0.35 * repetitions) * (easeFactor / 2.5)).toFixed(2),
  );

  return {
    repetitions,
    intervalDays,
    easeFactor: Number(easeFactor.toFixed(2)),
    stabilityDays,
    lastRating: rating,
    lastRevisedAt: now,
    dueAt: addDays(now, intervalDays),
    reviewCount: (revision.reviewCount || 0) + 1,
  };
}

/**
 * Initial revision state for a question the moment it is marked solved.
 * It becomes due after a short delay so it can enter the queue.
 */
function initialStateOnSolve(now = new Date()) {
  return {
    repetitions: 0,
    intervalDays: 0,
    easeFactor: 2.5,
    stabilityDays: UNREVISED_STABILITY_DAYS,
    lastRating: null,
    lastRevisedAt: null,
    dueAt: addDays(now, 2),
    reviewCount: 0,
  };
}

/**
 * Averages per-question memory scores into the user-level Retention Rating.
 * @param {number[]} scores
 * @returns {number} 0-100
 */
function averageRetention(scores) {
  if (!scores.length) return 0;
  const sum = scores.reduce((acc, s) => acc + s, 0);
  return Math.round(sum / scores.length);
}

/**
 * Human reading of a retention rating, matching Codolio's guidance:
 * above 70% is sticking, below 50% means slow down and revise more.
 */
function retentionLabel(rating) {
  if (rating >= 85) return 'excellent';
  if (rating >= 70) return 'strong';
  if (rating >= 50) return 'fair';
  return 'at-risk';
}

module.exports = {
  MS_PER_DAY,
  RATING_CONFIG,
  RATINGS,
  UNREVISED_STABILITY_DAYS,
  dateKey,
  startOfDay,
  addDays,
  clamp,
  computeMemoryScore,
  scheduleNext,
  initialStateOnSolve,
  averageRetention,
  retentionLabel,
};
