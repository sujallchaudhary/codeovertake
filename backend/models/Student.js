const mongoose = require('mongoose');

const studentSchema = new mongoose.Schema({
  rollno: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true,
    index: true,
  },
  name: { type: String, required: true, trim: true },
  branch: { type: String, required: true, trim: true, index: true },
  year: { type: Number, required: true, index: true },
  lastEditedAt: { type: Date, default: null },
  usernameHistory: [{
    changedAt: { type: Date, required: true },
    usernames: { type: Map, of: String },
    _id: false,
  }],

  github: {
    username: { type: String, default: '', trim: true },
    stats: {
      publicRepos: { type: Number, default: 0 },
      followers: { type: Number, default: 0 },
      totalStars: { type: Number, default: 0 },
      contributions: { type: Number, default: 0 },
    },
    lastUpdated: Date,
  },

  leetcode: {
    username: { type: String, default: '', trim: true },
    stats: {
      totalSolved: { type: Number, default: 0 },
      easySolved: { type: Number, default: 0 },
      mediumSolved: { type: Number, default: 0 },
      hardSolved: { type: Number, default: 0 },
      contestRating: { type: Number, default: 0 },
      contestsAttended: { type: Number, default: 0 },
      ranking: { type: Number, default: 0 },
    },
    lastUpdated: Date,
  },

  codeforces: {
    username: { type: String, default: '', trim: true },
    stats: {
      rating: { type: Number, default: 0 },
      maxRating: { type: Number, default: 0 },
      rank: { type: String, default: '' },
      maxRank: { type: String, default: '' },
      problemsSolved: { type: Number, default: 0 },
    },
    lastUpdated: Date,
  },

  codechef: {
    username: { type: String, default: '', trim: true },
    stats: {
      currentRating: { type: Number, default: 0 },
      highestRating: { type: Number, default: 0 },
      stars: { type: Number, default: 0 },
      globalRank: { type: Number, default: 0 },
      countryRank: { type: Number, default: 0 },
      totalProblemsSolved: { type: Number, default: 0 },
    },
    lastUpdated: Date,
    lastFetchFailed: { type: Boolean, default: false },
  },

  scores: {
    github: { type: Number, default: 0 },
    leetcode: { type: Number, default: 0 },
    codeforces: { type: Number, default: 0 },
    codechef: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
  },

  ranks: {
    overall: { type: Number, default: 0 },
    yearWise: { type: Number, default: 0 },
    branchWise: { type: Number, default: 0 },
    github: { type: Number, default: 0 },
    leetcode: { type: Number, default: 0 },
    codeforces: { type: Number, default: 0 },
    codechef: { type: Number, default: 0 },
  },

  heatmap: {
    github: { type: Map, of: Number, default: () => new Map() },
    leetcode: { type: Map, of: Number, default: () => new Map() },
    codeforces: { type: Map, of: Number, default: () => new Map() },
  },
}, {
  timestamps: true,
});

studentSchema.index({ 'scores.total': -1 });
studentSchema.index({ year: 1, 'scores.total': -1 });
studentSchema.index({ year: 1, branch: 1, 'scores.total': -1 });

module.exports = mongoose.model('Student', studentSchema);
