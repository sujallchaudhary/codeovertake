const mongoose = require('mongoose');

/**
 * A user's note.
 *
 * The defining feature (Codolio's "write once, see everywhere") is
 * `linkedProblems`: a single note can be attached to many problems, so a
 * "Sliding Window template" note written on one question automatically appears
 * in the Notes tab of every other question it is linked to.
 *
 * A note with an empty `linkedProblems` is a standalone note (cheat sheet,
 * revision summary) and shows up in the "My Notes" tab.
 */
const noteSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

  title: { type: String, required: true, trim: true },
  // Markdown, so fenced code blocks give us syntax highlighting for free
  content: { type: String, default: '' },

  linkedProblems: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Problem',
    index: true,
  }],

  tags: [{ type: String, trim: true }],
  pinned: { type: Boolean, default: false },
}, {
  timestamps: true,
});

// Fetching "all notes visible on this problem" is the hottest query
noteSchema.index({ user: 1, linkedProblems: 1 });
noteSchema.index({ user: 1, updatedAt: -1 });
noteSchema.index({ title: 'text', content: 'text' });

/** True when this is a standalone note rather than one attached to a problem. */
noteSchema.virtual('isGeneral').get(function isGeneral() {
  return !this.linkedProblems || this.linkedProblems.length === 0;
});

noteSchema.set('toJSON', { virtuals: true });
noteSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Note', noteSchema);
