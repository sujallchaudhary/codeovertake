const mongoose = require('mongoose');
const { REVISION_RATINGS } = require('./TrackedQuestion');

/**
 * Append-only record of every revision, used for the streak calendar, the
 * "revisions this week" stat and to audit how scheduling evolved.
 */
const revisionLogSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  problem: { type: mongoose.Schema.Types.ObjectId, ref: 'Problem', required: true },
  trackedQuestion: { type: mongoose.Schema.Types.ObjectId, ref: 'TrackedQuestion', required: true },

  rating: { type: String, enum: REVISION_RATINGS, required: true },
  // Denormalized YYYY-MM-DD so streak/heatmap queries need no date maths
  dateKey: { type: String, required: true, index: true },

  intervalBefore: { type: Number, default: 0 },
  intervalAfter: { type: Number, default: 0 },
  memoryScoreBefore: { type: Number, default: 0 },
}, {
  timestamps: true,
});

revisionLogSchema.index({ user: 1, dateKey: -1 });
revisionLogSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model('RevisionLog', revisionLogSchema);
