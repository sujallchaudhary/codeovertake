const mongoose = require('mongoose');

/**
 * The materialized Daily Revision Queue.
 *
 * Codolio picks up to 5 due questions each day and the selection stays put
 * until midnight, so it is stored rather than recomputed per request (otherwise
 * the list would shuffle as memory scores drift through the day).
 */
const revisionQueueSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  // YYYY-MM-DD in the app's reference timezone
  dateKey: { type: String, required: true },

  items: [{
    trackedQuestion: { type: mongoose.Schema.Types.ObjectId, ref: 'TrackedQuestion', required: true },
    problem: { type: mongoose.Schema.Types.ObjectId, ref: 'Problem', required: true },
    memoryScoreAtBuild: { type: Number, default: 0 },
    done: { type: Boolean, default: false },
    rating: { type: String, default: null },
    _id: false,
  }],

  completedAt: { type: Date, default: null },
}, {
  timestamps: true,
});

// One queue per user per day
revisionQueueSchema.index({ user: 1, dateKey: 1 }, { unique: true });

module.exports = mongoose.model('RevisionQueue', revisionQueueSchema);
