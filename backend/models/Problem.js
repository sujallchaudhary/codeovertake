const mongoose = require('mongoose');
const { PROBLEM_PLATFORMS } = require('../utils/problemUrl');

/**
 * A company that asks this problem in interviews, with recency buckets so the
 * Company Kits can offer "All-Time / Last 6 Months / Last 45 Days" views.
 */
const companyTagSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  slug: { type: String, required: true, trim: true, lowercase: true },
  // How often this problem shows up in reports for that company
  frequency: { type: Number, default: 1 },
  // Which recency windows this problem appears in
  buckets: [{ type: String, enum: ['all-time', '6-months', '45-days'] }],
  lastAskedAt: { type: Date, default: null },
}, { _id: false });

/**
 * Global, shared problem catalog. One row per problem per platform, referenced
 * by every user's TrackedQuestion, by Sheets and by Company Kits — so metadata
 * is fetched once and reused everywhere.
 */
const problemSchema = new mongoose.Schema({
  platform: {
    type: String,
    required: true,
    enum: PROBLEM_PLATFORMS.map((p) => p.key),
    index: true,
  },
  slug: { type: String, required: true, trim: true },
  title: { type: String, required: true, trim: true },
  url: { type: String, required: true },

  difficulty: {
    type: String,
    enum: ['easy', 'medium', 'hard', 'unrated'],
    default: 'unrated',
    index: true,
  },
  // Codeforces-style numeric difficulty, when the platform provides one
  rating: { type: Number, default: 0 },

  topics: [{ type: String, trim: true, index: true }],
  companies: [companyTagSchema],

  // Platform-native identifier (e.g. LeetCode's frontend question number)
  externalId: { type: String, default: '' },
  isPremium: { type: Boolean, default: false },
  acceptanceRate: { type: Number, default: 0 },

  // When metadata was last *attempted*, successfully or not
  metadataFetchedAt: { type: Date, default: null },
  /**
   * True when the last fetch could not produce real metadata (title fell back to
   * the slug). Tracked separately from metadataFetchedAt so a partial result is
   * retried on a shorter TTL rather than re-fetched on every single request.
   */
  metadataPartial: { type: Boolean, default: false },
}, {
  timestamps: true,
});

// Identity: one problem per (platform, slug)
problemSchema.index({ platform: 1, slug: 1 }, { unique: true });
// Powers "search by name" in the add-question modal
problemSchema.index({ title: 'text' });
problemSchema.index({ 'companies.slug': 1, 'companies.frequency': -1 });
problemSchema.index({ topics: 1, difficulty: 1 });

module.exports = mongoose.model('Problem', problemSchema);
