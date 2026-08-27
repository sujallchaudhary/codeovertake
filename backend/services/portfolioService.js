const crypto = require('crypto');
const axios = require('axios');
const User = require('../models/User');
const Student = require('../models/Student');
const TrackedQuestion = require('../models/TrackedQuestion');
const httpError = require('../utils/httpError');
const {
  getPortfolioPlatforms,
  getPortfolioPlatform,
  getPortfolioPlatformKeys,
} = require('../platforms');
const {
  fetchVerificationText,
  textContainsCode,
  getVerificationField,
} = require('../platforms/verification');
const { retentionLabel } = require('../utils/spacedRepetition');
const clerkService = require('./clerkService');

/** Codolio-style on-demand sync: refresh when viewed, at most every 15 minutes. */
const SYNC_COOLDOWN_MS = 15 * 60 * 1000;

/** Which platforms feed which C-Score pillar. */
const PILLARS = {
  dsa: ['leetcode', 'geeksforgeeks', 'interviewbit', 'codestudio', 'hackerrank'],
  cp: ['codeforces', 'codechef', 'atcoder'],
  dev: ['github'],
};

/* ------------------------------------------------------------------- C-Score */

/**
 * The C-Score: a holistic 0-1000 metric across DSA, Competitive Programming and
 * Development.
 *
 * Each pillar takes the best score among its platforms (so linking three CP
 * sites does not triple-count the same skill). The pillars are then blended with
 * fixed weights and multiplied by a balance factor worth up to +15%, which is
 * what makes the score reward breadth rather than a single spike.
 *
 * @param {Object} user
 * @returns {{dsa:number, cp:number, dev:number, total:number, balance:number}}
 */
function computeCScore(user) {
  const scoreFor = (keys) => keys.reduce((best, key) => {
    const score = user.platforms?.[key]?.score || 0;
    return Math.max(best, score);
  }, 0);

  const dsa = Math.round(scoreFor(PILLARS.dsa));
  const cp = Math.round(scoreFor(PILLARS.cp));
  const dev = Math.round(scoreFor(PILLARS.dev));

  const base = 0.45 * dsa + 0.30 * cp + 0.25 * dev;

  // 1.0 when all three pillars are equal, approaching 0 when only one is developed
  const max = Math.max(dsa, cp, dev);
  const min = Math.min(dsa, cp, dev);
  const balance = max > 0 ? (min + 1) / (max + 1) : 0;

  const total = Math.round(Math.min(1000, base * (0.85 + 0.15 * balance)));

  return {
    dsa, cp, dev, total, balance: Number(balance.toFixed(3)),
  };
}

/* ---------------------------------------------------------------------- sync */

/**
 * Refreshes stats for every connected, stats-capable platform, then recomputes
 * scores and the C-Score.
 *
 * Honours a 15-minute cooldown unless `force` is set. A platform returning null
 * never overwrites previously good stats (same anti-data-loss rule as the
 * leaderboard cron).
 *
 * @param {string} userId
 * @param {{force?:boolean}} options
 */
async function syncPlatforms(userId, options = {}) {
  const user = await User.findById(userId);
  if (!user) throw httpError(404, 'Account not found');

  const now = Date.now();
  const last = user.lastSyncedAt ? user.lastSyncedAt.getTime() : 0;
  const elapsed = now - last;

  if (!options.force && elapsed < SYNC_COOLDOWN_MS) {
    return {
      synced: false,
      cooldown: true,
      retryInSeconds: Math.ceil((SYNC_COOLDOWN_MS - elapsed) / 1000),
      lastSyncedAt: user.lastSyncedAt,
      cScore: user.cScore,
    };
  }

  const connected = getPortfolioPlatforms().filter(
    (p) => p.statsSupported !== false && user.platforms?.[p.key]?.username,
  );

  const results = await Promise.allSettled(
    connected.map((platform) => platform.fetchStats(user.platforms[platform.key].username)),
  );

  const perPlatform = {};
  results.forEach((result, index) => {
    const platform = connected[index];
    const key = platform.key;

    // A thrown adapter is a failure too, and must still be flagged
    if (result.status !== 'fulfilled') {
      user.platforms[key].lastFetchFailed = true;
      perPlatform[key] = { ok: false, error: result.reason?.message || 'fetch failed' };
      console.error(`[PORTFOLIO] ${key} sync failed: ${result.reason?.message}`);
      return;
    }

    const stats = result.value;
    if (stats) {
      user.platforms[key].stats = stats;
      user.platforms[key].score = platform.calculateScore(stats);
      user.platforms[key].lastFetchedAt = new Date();
      user.platforms[key].lastFetchFailed = false;
      perPlatform[key] = { ok: true, score: user.platforms[key].score };
    } else {
      // Preserve whatever we had; just flag the failure
      user.platforms[key].lastFetchFailed = true;
      perPlatform[key] = { ok: false };
    }
  });

  const cScore = computeCScore(user);
  user.cScore = { ...cScore, updatedAt: new Date() };
  user.lastSyncedAt = new Date();
  await user.save();

  return {
    synced: true,
    cooldown: false,
    lastSyncedAt: user.lastSyncedAt,
    cScore: user.cScore,
    platforms: perPlatform,
  };
}

/* ------------------------------------------------------- platform connections */

function generateVerificationCode() {
  return `CODEOVERTAKE-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}

/**
 * Saves a platform handle and issues a verification code.
 * The handle is validated against the platform first so typos are caught early.
 */
async function setPlatformHandle(user, platformKey, username) {
  const platform = getPortfolioPlatform(platformKey);
  if (!platform) throw httpError(400, `Unknown platform: ${platformKey}`);

  const handle = String(username || '').trim();
  if (!handle) {
    throw httpError(400, 'Username is required', [{ field: platformKey, message: 'Required' }]);
  }

  const valid = await platform.validateUsername(handle);
  if (!valid) {
    throw httpError(400, `That ${platform.label} username could not be found`, [{
      field: platformKey,
      message: 'Profile not found. Check the handle, or make sure the profile is public.',
    }]);
  }

  const changed = user.platforms[platformKey].username !== handle;
  user.platforms[platformKey].username = handle;

  if (changed) {
    // A new handle must be re-verified
    user.platforms[platformKey].verified = false;
    user.platforms[platformKey].verifiedAt = null;
    user.platforms[platformKey].verificationCode = generateVerificationCode();
    user.platforms[platformKey].stats = {};
    user.platforms[platformKey].score = 0;
  } else if (!user.platforms[platformKey].verificationCode) {
    user.platforms[platformKey].verificationCode = generateVerificationCode();
  }

  await user.save();

  // Pull stats straight away so the UI can show a live preview card
  if (platform.statsSupported !== false) {
    const stats = await platform.fetchStats(handle).catch(() => null);
    if (stats) {
      user.platforms[platformKey].stats = stats;
      user.platforms[platformKey].score = platform.calculateScore(stats);
      user.platforms[platformKey].lastFetchedAt = new Date();
      user.cScore = { ...computeCScore(user), updatedAt: new Date() };
      await user.save();
    }
  }

  return {
    platform: platformKey,
    username: handle,
    verified: user.platforms[platformKey].verified,
    stats: user.platforms[platformKey].stats,
    score: user.platforms[platformKey].score,
    verification: {
      code: user.platforms[platformKey].verificationCode,
      field: getVerificationField(platformKey),
    },
  };
}

/** The code + which field to paste it into. */
async function getVerificationInfo(user, platformKey) {
  const platform = getPortfolioPlatform(platformKey);
  if (!platform) throw httpError(400, `Unknown platform: ${platformKey}`);

  const entry = user.platforms[platformKey];
  if (!entry?.username) {
    throw httpError(400, `Connect your ${platform.label} handle first`);
  }
  if (!entry.verificationCode) {
    entry.verificationCode = generateVerificationCode();
    await user.save();
  }

  return {
    platform: platformKey,
    label: platform.label,
    username: entry.username,
    verified: entry.verified,
    code: entry.verificationCode,
    field: getVerificationField(platformKey),
    instructions: `Paste ${entry.verificationCode} into the "${getVerificationField(platformKey)}" `
      + `field on your ${platform.label} profile, save it, then press Verify. `
      + 'You can change the field back straight after verification.',
  };
}

/**
 * Reads the platform profile back and confirms the code is present.
 * GitHub is exempt: OAuth already proves ownership.
 */
async function verifyPlatform(user, platformKey) {
  const platform = getPortfolioPlatform(platformKey);
  if (!platform) throw httpError(400, `Unknown platform: ${platformKey}`);

  const entry = user.platforms[platformKey];
  if (!entry?.username) throw httpError(400, `Connect your ${platform.label} handle first`);

  if (platformKey === 'github') {
    // Linking GitHub as a Clerk social connection already proves ownership, so
    // there is no code to paste for this one.
    if (!user.githubAuth?.login) {
      throw httpError(400, 'Connect GitHub from your account settings to verify the development pillar');
    }
    entry.verified = true;
    entry.verifiedAt = new Date();
    await user.save();
    return { platform: platformKey, verified: true, method: 'oauth' };
  }

  if (entry.verified) {
    return { platform: platformKey, verified: true, alreadyVerified: true };
  }

  const text = await fetchVerificationText(platformKey, entry.username);
  if (!text) {
    throw httpError(502, `Could not read your ${platform.label} profile right now. `
      + 'Make sure it is public and try again in a minute.');
  }

  if (!textContainsCode(text, entry.verificationCode)) {
    throw httpError(400, `Verification code not found in your ${platform.label} `
      + `"${getVerificationField(platformKey)}" field`, [{
      field: platformKey,
      message: `Paste ${entry.verificationCode} into your ${getVerificationField(platformKey)} and save before verifying`,
    }]);
  }

  entry.verified = true;
  entry.verifiedAt = new Date();
  // Code is single-use; clear it so it cannot be replayed
  entry.verificationCode = '';
  user.cScore = { ...computeCScore(user), updatedAt: new Date() };
  await user.save();

  return { platform: platformKey, verified: true, method: 'code' };
}

/** Deregisters a platform, clearing its handle, stats and verification. */
async function removePlatform(user, platformKey) {
  const platform = getPortfolioPlatform(platformKey);
  if (!platform) throw httpError(400, `Unknown platform: ${platformKey}`);

  user.platforms[platformKey].username = '';
  user.platforms[platformKey].verified = false;
  user.platforms[platformKey].verifiedAt = null;
  user.platforms[platformKey].verificationCode = '';
  user.platforms[platformKey].stats = {};
  user.platforms[platformKey].score = 0;
  user.platforms[platformKey].lastFetchedAt = null;

  if (platformKey === 'github') {
    // The OAuth grant itself lives in Clerk; unlinking it there is a separate
    // action in the Clerk-managed account screen.
    user.githubAuth.login = '';
    user.githubAuth.connectedAt = null;
  }

  user.cScore = { ...computeCScore(user), updatedAt: new Date() };
  await user.save();
  return { platform: platformKey, removed: true, cScore: user.cScore };
}

/** Metadata driving the "connect platforms" screen. */
function listPortfolioPlatforms() {
  return {
    platforms: getPortfolioPlatforms().map((p) => ({
      key: p.key,
      label: p.label,
      statsSupported: p.statsSupported !== false,
      countsTowardsLeaderboard: p.leaderboard !== false,
      verificationField: getVerificationField(p.key),
      profileStats: p.profileStats || [],
      profileUrlTemplate: p.profileUrl('{username}'),
    })),
  };
}

/* ------------------------------------------------------------------ projects */

/**
 * Lists the user's GitHub repositories for the project picker.
 * Uses the stored OAuth token when available (higher rate limit + private repos).
 */
async function listGithubRepos(userId) {
  const user = await User.findById(userId);
  if (!user) throw httpError(404, 'Account not found');

  const login = user.githubAuth?.login || user.platforms?.github?.username;
  if (!login) throw httpError(400, 'Connect your GitHub account first');

  // Read the OAuth token from Clerk on demand rather than storing one, so a
  // database dump never contains usable GitHub credentials.
  const oauthToken = user.clerkUserId
    ? await clerkService.getOauthAccessToken(user.clerkUserId, 'github')
    : null;

  const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'CodeOvertake/1.0' };
  const token = oauthToken || process.env.GITHUB_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;

  // With the user's own token we can list private repos too; without it we fall
  // back to their public repos via the server token.
  const url = oauthToken
    ? 'https://api.github.com/user/repos?per_page=100&sort=updated&affiliation=owner'
    : `https://api.github.com/users/${login}/repos?per_page=100&sort=updated`;

  try {
    const res = await axios.get(url, { headers, timeout: 20000 });
    const linked = new Set((user.projects || []).map((p) => p.repoName).filter(Boolean));

    return {
      repos: (res.data || []).map((r) => ({
        name: r.name,
        fullName: r.full_name,
        description: r.description || '',
        url: r.html_url,
        homepage: r.homepage || '',
        language: r.language || '',
        topics: r.topics || [],
        stars: r.stargazers_count || 0,
        forks: r.forks_count || 0,
        updatedAt: r.updated_at,
        isPrivate: r.private,
        alreadyAdded: linked.has(r.name),
      })),
    };
  } catch (error) {
    throw httpError(502, `Could not load repositories from GitHub: ${error.message}`);
  }
}

async function addProject(user, data = {}) {
  const title = String(data.title || '').trim();
  if (!title) {
    throw httpError(400, 'Project title is required', [{ field: 'title', message: 'Required' }]);
  }
  if ((user.projects || []).length >= 60) {
    throw httpError(400, 'You can showcase at most 60 projects');
  }

  user.projects.push({
    title,
    description: String(data.description || ''),
    repoName: String(data.repoName || '').trim(),
    repoUrl: String(data.repoUrl || '').trim(),
    demoUrl: String(data.demoUrl || '').trim(),
    techStack: (data.techStack || []).map((t) => String(t).trim()).filter(Boolean),
    tags: (data.tags || []).map((t) => String(t).trim()).filter(Boolean),
    images: (data.images || []).map((t) => String(t).trim()).filter(Boolean),
    stars: Number(data.stars) || 0,
    // New projects go to the top so the freshest work leads
    order: -1,
  });

  normalizeProjectOrder(user);
  await user.save();
  return { projects: user.projects };
}

/** Rewrites `order` to a dense 0..n-1 sequence in current display order. */
function normalizeProjectOrder(user) {
  const sorted = [...user.projects].sort((a, b) => (a.order || 0) - (b.order || 0));
  sorted.forEach((project, index) => { project.order = index; });
}

async function updateProject(user, projectId, data = {}) {
  const project = user.projects.id(projectId);
  if (!project) throw httpError(404, 'Project not found');

  const fields = ['title', 'description', 'repoName', 'repoUrl', 'demoUrl'];
  for (const field of fields) {
    if (data[field] !== undefined) project[field] = String(data[field]);
  }
  for (const field of ['techStack', 'tags', 'images']) {
    if (data[field] !== undefined) {
      project[field] = (data[field] || []).map((t) => String(t).trim()).filter(Boolean);
    }
  }
  if (data.stars !== undefined) project.stars = Number(data.stars) || 0;

  await user.save();
  return { project };
}

async function deleteProject(user, projectId) {
  const project = user.projects.id(projectId);
  if (!project) throw httpError(404, 'Project not found');
  project.deleteOne();
  normalizeProjectOrder(user);
  await user.save();
  return { message: 'Project removed', id: String(projectId) };
}

/** Persists a drag-and-drop reorder: `order` is an array of project ids. */
async function reorderProjects(user, order = []) {
  if (!Array.isArray(order)) throw httpError(400, 'order must be an array of project ids');

  order.forEach((projectId, index) => {
    const project = user.projects.id(projectId);
    if (project) project.order = index;
  });
  // Anything not mentioned lands after the explicitly ordered items
  user.projects.forEach((project) => {
    if (!order.includes(String(project._id))) project.order = order.length + (project.order || 0);
  });

  normalizeProjectOrder(user);
  await user.save();
  return { projects: user.projects };
}

/**
 * Toggles an upvote on someone's project. One vote per user, and you cannot
 * upvote your own work.
 */
async function toggleProjectUpvote(viewerId, handle, projectId) {
  const owner = await User.findOne({ handle: String(handle).toLowerCase() });
  if (!owner) throw httpError(404, 'Profile not found');
  if (String(owner._id) === String(viewerId)) {
    throw httpError(400, 'You cannot upvote your own project');
  }

  const project = owner.projects.id(projectId);
  if (!project) throw httpError(404, 'Project not found');

  const index = project.upvotedBy.findIndex((id) => String(id) === String(viewerId));
  const upvoted = index === -1;
  if (upvoted) project.upvotedBy.push(viewerId);
  else project.upvotedBy.splice(index, 1);

  await owner.save();
  return { upvoted, upvotes: project.upvotedBy.length };
}

/** A single shareable project page. */
async function getProject(handle, projectId, viewerId = null) {
  const owner = await User.findOne({ handle: String(handle).toLowerCase() })
    .select('name handle avatarUrl headline projects isPublic')
    .lean();
  if (!owner) throw httpError(404, 'Profile not found');

  const project = (owner.projects || []).find((p) => String(p._id) === String(projectId));
  if (!project) throw httpError(404, 'Project not found');

  return {
    project: {
      ...project,
      id: String(project._id),
      upvotes: (project.upvotedBy || []).length,
      hasUpvoted: Boolean(viewerId)
        && (project.upvotedBy || []).some((id) => String(id) === String(viewerId)),
      upvotedBy: undefined,
    },
    owner: {
      name: owner.name, handle: owner.handle, avatarUrl: owner.avatarUrl, headline: owner.headline,
    },
  };
}

/* -------------------------------------------------- education and experience */

/** Shared add/update/delete for the two list-shaped profile sections. */
function makeSectionOps(field, requiredKey, label) {
  return {
    async add(user, data = {}) {
      if (!String(data[requiredKey] || '').trim()) {
        throw httpError(400, `${label} is required`, [{ field: requiredKey, message: 'Required' }]);
      }
      user[field].push(data);
      await user.save();
      return { [field]: user[field] };
    },
    async update(user, itemId, data = {}) {
      const item = user[field].id(itemId);
      if (!item) throw httpError(404, `${label} entry not found`);
      Object.entries(data).forEach(([key, value]) => {
        if (key !== '_id' && value !== undefined) item[key] = value;
      });
      await user.save();
      return { [field]: user[field] };
    },
    async remove(user, itemId) {
      const item = user[field].id(itemId);
      if (!item) throw httpError(404, `${label} entry not found`);
      item.deleteOne();
      await user.save();
      return { [field]: user[field] };
    },
  };
}

const educationOps = makeSectionOps('education', 'institute', 'Institute');
const experienceOps = makeSectionOps('experience', 'company', 'Company');

/* ------------------------------------------------------------ public profile */

/**
 * The public, recruiter-facing portfolio: one link instead of five.
 *
 * Triggers an on-demand stats refresh when the owner is the one viewing (which
 * is what makes "solve on LeetCode, open your profile, see it update" work).
 */
async function getPublicPortfolio(handle, viewer = null) {
  const user = await User.findOne({ handle: String(handle).toLowerCase() });
  if (!user) throw httpError(404, 'Profile not found');

  const isOwner = Boolean(viewer) && String(viewer._id) === String(user._id);
  if (!user.isPublic && !isOwner) {
    throw httpError(403, 'This profile is private');
  }

  // Owner viewing their own profile refreshes the data (respecting the cooldown)
  let syncResult = null;
  if (isOwner) {
    syncResult = await syncPlatforms(user._id).catch((err) => {
      console.error('[PORTFOLIO] sync on view failed:', err.message);
      return null;
    });
  }

  const fresh = isOwner ? await User.findById(user._id) : user;

  const platforms = getPortfolioPlatforms()
    .filter((p) => fresh.platforms?.[p.key]?.username)
    .map((p) => {
      const entry = fresh.platforms[p.key];
      return {
        key: p.key,
        label: p.label,
        username: entry.username,
        verified: entry.verified,
        statsSupported: p.statsSupported !== false,
        stats: entry.stats || {},
        score: entry.score || 0,
        profileUrl: p.profileUrl(entry.username),
        profileStats: p.profileStats || [],
        lastFetchedAt: entry.lastFetchedAt,
        lastFetchFailed: entry.lastFetchFailed,
      };
    });

  // Workspace summary doubles as proof-of-practice on the portfolio
  const [workspaceTotals, linkedStudent] = await Promise.all([
    TrackedQuestion.aggregate([
      { $match: { user: fresh._id } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
        },
      },
    ]),
    fresh.rollno
      ? Student.findOne({ rollno: fresh.rollno }).select('rollno name branch year scores ranks').lean()
      : null,
  ]);

  const statusMap = workspaceTotals.reduce((acc, r) => { acc[r._id] = r.count; return acc; }, {});

  const projects = [...(fresh.projects || [])]
    .sort((a, b) => (a.order || 0) - (b.order || 0))
    .map((p) => {
      const obj = p.toObject ? p.toObject() : p;
      return {
        ...obj,
        id: String(obj._id),
        upvotes: (obj.upvotedBy || []).length,
        hasUpvoted: Boolean(viewer)
          && (obj.upvotedBy || []).some((id) => String(id) === String(viewer._id)),
        upvotedBy: undefined,
      };
    });

  return {
    profile: {
      handle: fresh.handle,
      name: fresh.name,
      avatarUrl: fresh.avatarUrl,
      headline: fresh.headline,
      about: fresh.about,
      location: fresh.location,
      socials: fresh.socials,
      rollno: fresh.rollno,
      createdAt: fresh.createdAt,
    },
    // The Dev Card is unlocked by verifying at least one platform
    devCard: {
      unlocked: fresh.hasAnyVerifiedPlatform(),
      verifiedPlatforms: getPortfolioPlatformKeys().filter((k) => fresh.platforms?.[k]?.verified),
    },
    cScore: fresh.cScore,
    platforms,
    projects,
    education: fresh.education,
    experience: fresh.experience,
    practice: {
      tracked: (statusMap.solved || 0) + (statusMap.unsolved || 0),
      solved: statusMap.solved || 0,
      retentionRating: fresh.revision?.retentionRating || 0,
      retentionLabel: retentionLabel(fresh.revision?.retentionRating || 0),
      revisionStreak: fresh.revision?.streak || 0,
    },
    leaderboard: linkedStudent,
    isOwner,
    sync: syncResult ? {
      synced: syncResult.synced,
      lastSyncedAt: syncResult.lastSyncedAt,
      retryInSeconds: syncResult.retryInSeconds || 0,
    } : null,
  };
}

/**
 * Global C-Score leaderboard. Only verified profiles are listed, matching
 * Codolio's rule that ranking requires proven account ownership.
 */
async function getGlobalLeaderboard(query = {}) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 25));

  // At least one verified platform
  const verifiedFilter = {
    isPublic: true,
    $or: getPortfolioPlatformKeys().map((key) => ({ [`platforms.${key}.verified`]: true })),
  };

  const [users, total] = await Promise.all([
    User.find(verifiedFilter)
      .select('handle name avatarUrl headline cScore platforms rollno')
      .sort({ 'cScore.total': -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    User.countDocuments(verifiedFilter),
  ]);

  return {
    users: users.map((u, i) => ({
      rank: (page - 1) * limit + i + 1,
      handle: u.handle,
      name: u.name,
      avatarUrl: u.avatarUrl,
      headline: u.headline,
      cScore: u.cScore,
      verifiedPlatforms: getPortfolioPlatformKeys().filter((k) => u.platforms?.[k]?.verified),
    })),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) || 0 },
  };
}

module.exports = {
  SYNC_COOLDOWN_MS,
  PILLARS,
  computeCScore,
  syncPlatforms,
  setPlatformHandle,
  getVerificationInfo,
  verifyPlatform,
  removePlatform,
  listPortfolioPlatforms,
  listGithubRepos,
  addProject,
  updateProject,
  deleteProject,
  reorderProjects,
  toggleProjectUpvote,
  getProject,
  educationOps,
  experienceOps,
  getPublicPortfolio,
  getGlobalLeaderboard,
};
