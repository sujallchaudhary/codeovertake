const mongoose = require('mongoose');
const { getPortfolioPlatformKeys } = require('../platforms');

/**
 * Per-platform connection sub-schema, generated from the platform registry so
 * adding a new adapter in platforms/index.js automatically extends the User.
 *
 *   username         - the public handle on that platform
 *   verified         - proved ownership by echoing verificationCode on the profile
 *   verificationCode - one-time code the user pastes into their external profile
 *   stats            - last successful fetchStats() payload (shape varies per platform)
 */
function buildPlatformFields() {
  const fields = {};
  for (const key of getPortfolioPlatformKeys()) {
    fields[key] = {
      username: { type: String, default: '', trim: true },
      verified: { type: Boolean, default: false },
      verificationCode: { type: String, default: '' },
      verifiedAt: { type: Date, default: null },
      stats: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
      score: { type: Number, default: 0 },
      lastFetchedAt: { type: Date, default: null },
      lastFetchFailed: { type: Boolean, default: false },
    };
  }
  return fields;
}

const educationSchema = new mongoose.Schema({
  institute: { type: String, required: true, trim: true },
  degree: { type: String, default: '', trim: true },
  field: { type: String, default: '', trim: true },
  startYear: { type: Number, default: null },
  endYear: { type: Number, default: null },
  grade: { type: String, default: '', trim: true },
  description: { type: String, default: '' },
});

const experienceSchema = new mongoose.Schema({
  company: { type: String, required: true, trim: true },
  role: { type: String, default: '', trim: true },
  employmentType: {
    type: String,
    enum: ['full-time', 'part-time', 'internship', 'freelance', 'open-source', 'other'],
    default: 'internship',
  },
  location: { type: String, default: '', trim: true },
  startDate: { type: Date, default: null },
  endDate: { type: Date, default: null },
  current: { type: Boolean, default: false },
  description: { type: String, default: '' },
});

const projectSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  // GitHub linkage
  repoName: { type: String, default: '', trim: true },
  repoUrl: { type: String, default: '', trim: true },
  demoUrl: { type: String, default: '', trim: true },
  techStack: [{ type: String, trim: true }],
  tags: [{ type: String, trim: true }],
  images: [{ type: String, trim: true }],
  stars: { type: Number, default: 0 },
  // Upvoters are stored as user ids so a user can only upvote once
  upvotedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  order: { type: Number, default: 0 },
}, { timestamps: true });

const userSchema = new mongoose.Schema({
  /**
   * Clerk is the identity provider: this is the account's real primary key.
   * Everything else on this document is either our own data (portfolio,
   * platforms, workspace) or a cache of Clerk fields kept fresh by the
   * `user.updated` webhook.
   *
   * We never store passwords - Clerk owns credentials, social sign-in and MFA.
   */
  clerkUserId: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    index: true,
  },

  // Cached from Clerk's primary email address
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    index: true,
  },
  /**
   * Every address Clerk has *verified*. Identity decisions (claiming a roll
   * number by institute email, matching a sheet collaborator invite) read this
   * rather than `email`, because only verified addresses prove anything.
   */
  verifiedEmails: [{ type: String, lowercase: true, trim: true }],

  // Public portfolio slug: codeovertake.com/u/<handle>
  handle: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    index: true,
  },
  name: { type: String, required: true, trim: true },
  avatarUrl: { type: String, default: '' },
  /**
   * Set once the user edits their name/avatar here. While false, both mirror
   * Clerk; once true, Clerk syncs leave them alone so a deliberate local edit
   * is not reverted by the next `user.updated` webhook.
   */
  nameOverridden: { type: Boolean, default: false },
  avatarOverridden: { type: Boolean, default: false },
  headline: { type: String, default: '', trim: true },
  about: { type: String, default: '' },
  location: { type: String, default: '', trim: true },

  socials: {
    website: { type: String, default: '' },
    linkedin: { type: String, default: '' },
    twitter: { type: String, default: '' },
  },

  /**
   * Link to the NSUT leaderboard Student document.
   *
   * Only ever written by a *verified* claim (services/claimService.js) - never
   * from a plain profile update - because it is what makes the leaderboard
   * profile appear on this portfolio.
   */
  rollno: { type: String, default: null, uppercase: true, trim: true, index: true },
  rollnoClaimedAt: { type: Date, default: null },

  platforms: buildPlatformFields(),

  /**
   * GitHub social connection.
   *
   * The OAuth access token is deliberately NOT stored: it is read from Clerk on
   * demand (clerkService.getOauthAccessToken) whenever the project picker needs
   * it, so a database dump never contains usable GitHub credentials.
   */
  githubAuth: {
    login: { type: String, default: '' },
    connectedAt: { type: Date, default: null },
  },

  education: [educationSchema],
  experience: [experienceSchema],
  projects: [projectSchema],

  /**
   * C-Score: holistic metric measuring balance across the three pillars.
   * Each pillar is 0-1000; total is a balance-weighted blend (see portfolioService).
   */
  cScore: {
    dsa: { type: Number, default: 0 },
    cp: { type: Number, default: 0 },
    dev: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
    updatedAt: { type: Date, default: null },
  },

  // Spaced-repetition aggregate state (see services/revisionService.js)
  revision: {
    streak: { type: Number, default: 0 },
    longestStreak: { type: Number, default: 0 },
    lastRevisionDate: { type: String, default: '' }, // YYYY-MM-DD
    retentionRating: { type: Number, default: 0 },   // 0-100
    retentionUpdatedAt: { type: Date, default: null },
    totalRevisions: { type: Number, default: 0 },
  },

  // On-demand sync throttle (Codolio-style 15 minute cooldown)
  lastSyncedAt: { type: Date, default: null },

  // Chrome extension pairing token
  extensionToken: { type: String, default: '', select: false },

  isPublic: { type: Boolean, default: true },
}, {
  timestamps: true,
});

userSchema.index({ 'cScore.total': -1 });

/** Only verified profiles appear on global leaderboards (Codolio rule). */
userSchema.methods.hasAnyVerifiedPlatform = function hasAnyVerifiedPlatform() {
  return getPortfolioPlatformKeys().some((key) => this.platforms?.[key]?.verified);
};

/** Strip everything that should never leave the server. */
userSchema.methods.toSafeJSON = function toSafeJSON() {
  const obj = this.toObject({ virtuals: true });
  delete obj.extensionToken;
  // Verification codes are only shown through the dedicated endpoint
  for (const key of getPortfolioPlatformKeys()) {
    if (obj.platforms?.[key]) delete obj.platforms[key].verificationCode;
  }
  return obj;
};

module.exports = mongoose.model('User', userSchema);
