const crypto = require('crypto');
const User = require('../models/User');
const httpError = require('../utils/httpError');
const clerkService = require('./clerkService');

const HANDLE_RE = /^[a-z0-9][a-z0-9_-]{2,29}$/;

/** Turns arbitrary text into a candidate handle: "Sujal Chaudhary!" -> "sujal-chaudhary" */
function slugifyHandle(input) {
  return String(input || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24);
}

/** Finds a free handle by appending a numeric suffix when needed. */
async function allocateHandle(preferred) {
  let base = slugifyHandle(preferred);
  if (base.length < 3) base = `dev-${base}`.slice(0, 24);
  if (!(await User.exists({ handle: base }))) return base;

  for (let i = 2; i < 500; i += 1) {
    const candidate = `${base}-${i}`.slice(0, 30);
    // eslint-disable-next-line no-await-in-loop
    if (!(await User.exists({ handle: candidate }))) return candidate;
  }
  // Extremely unlikely; fall back to random
  return `${base.slice(0, 20)}-${crypto.randomBytes(3).toString('hex')}`;
}

/**
 * Copies the Clerk-owned fields onto our local mirror.
 *
 * Called both when provisioning a brand new user and from the `user.updated`
 * webhook, so email/name/avatar changes made in Clerk land here too.
 */
function applyClerkFields(user, clerkUser) {
  const email = clerkService.primaryEmailOf(clerkUser);
  if (email) user.email = email;
  user.verifiedEmails = clerkService.verifiedEmailsOf(clerkUser);

  // Name and avatar mirror Clerk *until* the user edits them here. The override
  // flags are persisted, so a later `user.updated` webhook cannot silently
  // revert something they deliberately changed in our Edit Profile screen.
  if (!user.nameOverridden) user.name = clerkService.displayNameOf(clerkUser);
  if (!user.avatarOverridden && clerkUser.imageUrl) user.avatarUrl = clerkUser.imageUrl;

  /**
   * Admin status is recomputed on every sync so that removing someone from
   * ADMIN_EMAILS, or clearing their Clerk role, actually revokes access.
   *
   * A manual promotion from the admin panel is preserved: `adminGrantedManually`
   * marks it so a sync does not undo it.
   */
  const adminEmails = String(process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);

  // Only *verified* addresses count, otherwise adding an unverified admin email
  // to your own Clerk account would be enough to self-promote.
  const byEmail = user.verifiedEmails.some((address) => adminEmails.includes(address));
  const byClerkRole = String(clerkUser.publicMetadata?.role || '').toLowerCase() === 'admin';
  user.isAdmin = byEmail || byClerkRole || Boolean(user.adminGrantedManually);

  // A linked GitHub social connection is itself proof of ownership, so it
  // verifies the development pillar without a manual code.
  const github = clerkService.externalAccountsOf(clerkUser).find((a) => a.provider === 'github');
  if (github?.username) {
    user.githubAuth.login = github.username;
    if (!user.githubAuth.connectedAt) user.githubAuth.connectedAt = new Date();
    if (!user.platforms.github.username) user.platforms.github.username = github.username;
    if (user.platforms.github.username === github.username && !user.platforms.github.verified) {
      user.platforms.github.verified = true;
      user.platforms.github.verifiedAt = new Date();
    }
  }

  return user;
}

/**
 * Resolves a Clerk user id to our local User, creating it on first sight.
 *
 * Provisioning here rather than relying solely on the `user.created` webhook is
 * deliberate: webhooks are eventually consistent, so a user who signs up and
 * immediately hits the API would otherwise 401 until the webhook landed.
 *
 * @param {string} clerkUserId
 * @returns {Promise<import('mongoose').Document>}
 */
async function findOrCreateFromClerk(clerkUserId) {
  const existing = await User.findOne({ clerkUserId });
  if (existing) return existing;

  // First request for this account: pull the profile from Clerk once, then cache
  const clerkUser = await clerkService.getClerkUser(clerkUserId);
  const email = clerkService.primaryEmailOf(clerkUser);
  if (!email) {
    throw httpError(400, 'Your Clerk account has no email address attached');
  }

  // An account may already exist from an earlier sign-in with the same email
  // (for example email/password before a provider was linked). Adopt it rather
  // than failing on the unique email index.
  const byEmail = await User.findOne({ email });
  if (byEmail) {
    byEmail.clerkUserId = clerkUserId;
    applyClerkFields(byEmail, clerkUser);
    await byEmail.save();
    return byEmail;
  }

  const name = clerkService.displayNameOf(clerkUser);
  const handle = await allocateHandle(clerkUser.username || name || email.split('@')[0]);

  const user = new User({
    clerkUserId,
    email,
    name,
    handle,
    avatarUrl: clerkUser.imageUrl
      || `https://api.dicebear.com/9.x/identicon/svg?seed=${encodeURIComponent(handle)}`,
  });
  applyClerkFields(user, clerkUser);

  try {
    await user.save();
    return user;
  } catch (err) {
    // Two concurrent first requests can race on the unique index
    if (err.code === 11000) {
      const raced = await User.findOne({ clerkUserId });
      if (raced) return raced;
    }
    throw err;
  }
}

/**
 * Re-syncs a local user from Clerk. Used by the `user.updated` webhook.
 * Returns null when we have no local record for that Clerk id yet (nothing to
 * do - it will be provisioned on their next request).
 */
async function syncFromClerk(clerkUserId) {
  const user = await User.findOne({ clerkUserId });
  if (!user) return null;
  const clerkUser = await clerkService.getClerkUser(clerkUserId);
  applyClerkFields(user, clerkUser);
  await user.save();
  return user;
}

/**
 * Removes a local account and everything that belongs only to it.
 *
 * Driven by Clerk's `user.deleted` webhook, so deleting in Clerk really does
 * delete here. Content that other people depend on is detached rather than
 * destroyed: sheets they follow, projects they upvoted, sheets they collaborate
 * on. Leaderboard `Student` records are never deleted - they are institutional
 * data - the claim link is simply released.
 */
async function deleteLocalAccount(clerkUserId) {
  const user = await User.findOne({ clerkUserId });
  if (!user) return { deleted: false };

  // Required lazily: these models pull in services that import this one
  /* eslint-disable global-require */
  const TrackedQuestion = require('../models/TrackedQuestion');
  const Note = require('../models/Note');
  const RevisionLog = require('../models/RevisionLog');
  const RevisionQueue = require('../models/RevisionQueue');
  const Sheet = require('../models/Sheet');
  const SheetFollow = require('../models/SheetFollow');
  const Student = require('../models/Student');
  /* eslint-enable global-require */

  const userId = user._id;

  await Promise.all([
    // Owned exclusively by this user
    TrackedQuestion.deleteMany({ user: userId }),
    Note.deleteMany({ user: userId }),
    RevisionLog.deleteMany({ user: userId }),
    RevisionQueue.deleteMany({ user: userId }),
    SheetFollow.deleteMany({ user: userId }),
    Sheet.deleteMany({ owner: userId }),

    // Shared: detach rather than delete
    Sheet.updateMany(
      { 'collaborators.user': userId },
      { $pull: { collaborators: { user: userId } } },
    ),
    User.updateMany(
      { 'projects.upvotedBy': userId },
      { $pull: { 'projects.$[].upvotedBy': userId } },
    ),

    // Release the leaderboard claim so the profile can be claimed again
    Student.updateMany(
      { claimedBy: userId },
      { $set: { claimedBy: null, claimedAt: null } },
    ),
  ]);

  await User.deleteOne({ _id: userId });
  console.log(`[AUTH] Deleted local account for Clerk user ${clerkUserId}`);
  return { deleted: true };
}

/** Returns the signed-in user's full (safe) document. */
async function me(user) {
  return user.toSafeJSON();
}

/**
 * Updates the parts of the profile we own.
 *
 * Note `rollno` is intentionally not editable here: linking a leaderboard
 * profile requires a verified claim (services/claimService.js), otherwise anyone
 * could point their portfolio at someone else's roll number.
 */
async function updateAccount(user, data) {
  const editable = ['name', 'headline', 'about', 'location', 'avatarUrl', 'isPublic'];
  for (const field of editable) {
    if (data[field] !== undefined) user[field] = data[field];
  }
  // Mark these as locally owned so Clerk syncs stop overwriting them
  if (data.name !== undefined) user.nameOverridden = true;
  if (data.avatarUrl !== undefined) user.avatarOverridden = true;
  if (data.socials) {
    for (const key of ['website', 'linkedin', 'twitter']) {
      if (data.socials[key] !== undefined) user.socials[key] = data.socials[key];
    }
  }
  if (data.handle !== undefined && data.handle !== user.handle) {
    const handle = String(data.handle).toLowerCase().trim();
    if (!HANDLE_RE.test(handle)) {
      throw httpError(400, 'Invalid handle', [{
        field: 'handle',
        message: '3-30 chars, lowercase letters, numbers, hyphen or underscore',
      }]);
    }
    if (await User.exists({ handle, _id: { $ne: user._id } })) {
      throw httpError(409, 'Handle is taken', [{ field: 'handle', message: 'Already taken' }]);
    }
    user.handle = handle;
  }
  await user.save();
  return user.toSafeJSON();
}

async function checkHandle(handle) {
  const normalized = String(handle || '').toLowerCase().trim();
  if (!HANDLE_RE.test(normalized)) {
    return { handle: normalized, available: false, reason: 'invalid' };
  }
  const taken = await User.exists({ handle: normalized });
  return { handle: normalized, available: !taken, reason: taken ? 'taken' : null };
}

/**
 * Issues (or reuses) the long-lived token the browser extension stores.
 *
 * The extension cannot hold a Clerk session (short-lived tokens need a browser
 * context to refresh), so it authenticates with this instead. See
 * middlewares/auth.js.
 */
async function getExtensionToken(userId) {
  const user = await User.findById(userId).select('+extensionToken');
  if (!user) throw httpError(404, 'Account not found');
  if (!user.extensionToken) {
    user.extensionToken = crypto.randomBytes(24).toString('hex');
    await user.save();
  }
  return { extensionToken: user.extensionToken };
}

async function revokeExtensionToken(userId) {
  const user = await User.findById(userId).select('+extensionToken');
  if (!user) throw httpError(404, 'Account not found');
  user.extensionToken = crypto.randomBytes(24).toString('hex');
  await user.save();
  return { extensionToken: user.extensionToken };
}

module.exports = {
  allocateHandle,
  applyClerkFields,
  findOrCreateFromClerk,
  syncFromClerk,
  deleteLocalAccount,
  me,
  updateAccount,
  checkHandle,
  getExtensionToken,
  revokeExtensionToken,
};
