const mongoose = require('mongoose');

/** Categories mirror Codolio's Explore Sheets tabs. */
const SHEET_CATEGORIES = ['popular', 'mastery', 'cp', 'quick-revision', 'company', 'custom'];

const sheetQuestionSchema = new mongoose.Schema({
  problem: { type: mongoose.Schema.Types.ObjectId, ref: 'Problem', required: true },
  order: { type: Number, default: 0 },
  // Optional per-sheet override, e.g. a curator's own note about why it matters
  hint: { type: String, default: '' },
}, { _id: false });

/** A nested folder: "Arrays" -> "2D Arrays". */
const subsectionSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  order: { type: Number, default: 0 },
  questions: [sheetQuestionSchema],
});

/** A top-level folder in the sheet. */
const sectionSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  order: { type: Number, default: 0 },
  questions: [sheetQuestionSchema],
  subsections: [subsectionSchema],
});

/**
 * A Sheet: a curated or user-built list of problems.
 *
 * Structure is deliberately flexible (Codolio parity): questions can sit at the
 * root, inside a topic, or inside a subtopic of a topic.
 *
 * Progress is NOT stored here. Solved status lives on the user's
 * TrackedQuestion, so solving a problem once marks it done in every sheet that
 * contains it, and collaborators never see each other's progress.
 */
const sheetSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  slug: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
  description: { type: String, default: '' },

  // null for built-in curated sheets
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
  isCurated: { type: Boolean, default: false, index: true },
  // Credit line for curated lists ("Striver", "Blind", ...)
  curator: { type: String, default: '' },

  category: { type: String, enum: SHEET_CATEGORIES, default: 'custom', index: true },
  visibility: { type: String, enum: ['public', 'private'], default: 'private', index: true },
  tags: [{ type: String, trim: true }],
  icon: { type: String, default: '' },

  // Root-level questions that are not inside any topic
  questions: [sheetQuestionSchema],
  sections: [sectionSchema],

  /**
   * Collaborators get edit access to the question list but never see the
   * owner's solved status.
   */
  collaborators: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    email: { type: String, required: true, lowercase: true, trim: true },
    addedAt: { type: Date, default: Date.now },
    _id: false,
  }],

  // Denormalized counters kept in sync by the service
  questionCount: { type: Number, default: 0 },
  followerCount: { type: Number, default: 0 },
}, {
  timestamps: true,
});

sheetSchema.index({ category: 1, isCurated: 1, followerCount: -1 });
sheetSchema.index({ owner: 1, updatedAt: -1 });
sheetSchema.index({ title: 'text', description: 'text' });

module.exports = mongoose.model('Sheet', sheetSchema);
module.exports.SHEET_CATEGORIES = SHEET_CATEGORIES;
