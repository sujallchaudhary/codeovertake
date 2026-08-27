const mongoose = require('mongoose');

/** The four confidence levels a user picks after revising a question. */
const REVISION_RATINGS = ['struggled', 'tough', 'got-it', 'nailed-it'];

/**
 * A question in a user's Workspace.
 *
 * This is the join between a User and the global Problem catalog, and it also
 * carries the per-user spaced-repetition state. Because status lives here
 * (rather than on a sheet), marking a problem solved once shows up as solved in
 * every sheet that contains it — Codolio's "smart sync" behaviour.
 */
const trackedQuestionSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  problem: { type: mongoose.Schema.Types.ObjectId, ref: 'Problem', required: true, index: true },

  status: { type: String, enum: ['unsolved', 'solved'], default: 'unsolved', index: true },
  solvedAt: { type: Date, default: null },
  starred: { type: Boolean, default: false },

  /**
   * Free-form user tags ("Tricky", "Revise Next Week", "Attempted").
   * Codolio deliberately has no "Attempted" status; users model it with a tag.
   */
  tags: [{ type: String, trim: true }],

  // Where it entered the workspace, for the "added via" hint in the UI
  source: {
    type: String,
    enum: ['manual', 'sheet', 'extension', 'import'],
    default: 'manual',
  },
  sourceSheet: { type: mongoose.Schema.Types.ObjectId, ref: 'Sheet', default: null },

  /**
   * SM-2-derived scheduling state. `stabilityDays` is the memory half-life used
   * to compute the decaying "memory battery" powering the Retention Rating.
   */
  revision: {
    repetitions: { type: Number, default: 0 },
    intervalDays: { type: Number, default: 0 },
    easeFactor: { type: Number, default: 2.5 },
    stabilityDays: { type: Number, default: 0 },
    lastRating: { type: String, enum: [...REVISION_RATINGS, null], default: null },
    lastRevisedAt: { type: Date, default: null },
    dueAt: { type: Date, default: null, index: true },
    reviewCount: { type: Number, default: 0 },
  },
}, {
  timestamps: true,
});

// A problem appears at most once per workspace
trackedQuestionSchema.index({ user: 1, problem: 1 }, { unique: true });
trackedQuestionSchema.index({ user: 1, status: 1, starred: 1 });
trackedQuestionSchema.index({ user: 1, tags: 1 });
trackedQuestionSchema.index({ user: 1, 'revision.dueAt': 1 });

module.exports = mongoose.model('TrackedQuestion', trackedQuestionSchema);
module.exports.REVISION_RATINGS = REVISION_RATINGS;
