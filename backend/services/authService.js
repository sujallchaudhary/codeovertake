const crypto = require('crypto');
const bcrypt = require('bcrypt');
const axios = require('axios');
const User = require('../models/User');
const { signToken } = require('../utils/jwt');
const httpError = require('../utils/httpError');

const SALT_ROUNDS = 10;
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
    if (!(await User.exists({ handle: candidate }))) return candidate;
  }
  // Extremely unlikely; fall back to random
  return `${base.slice(0, 20)}-${crypto.randomBytes(3).toString('hex')}`;
}

function issueSession(user) {
  return {
    token: signToken({ sub: String(user._id), handle: user.handle }),
    user: user.toSafeJSON(),
  };
}

/**
 * Registers an email/password account.
 * @param {{email:string,password:string,name:string,handle?:string,rollno?:string}} data
 */
async function signup(data) {
  const email = String(data.email || '').toLowerCase().trim();
  const password = String(data.password || '');
  const name = String(data.name || '').trim();

  if (await User.exists({ email })) {
    throw httpError(409, 'An account with this email already exists', [
      { field: 'email', message: 'Already registered' },
    ]);
  }

  let handle;
  if (data.handle) {
    handle = String(data.handle).toLowerCase().trim();
    if (!HANDLE_RE.test(handle)) {
      throw httpError(400, 'Invalid handle', [{
        field: 'handle',
        message: '3-30 chars, lowercase letters, numbers, hyphen or underscore',
      }]);
    }
    if (await User.exists({ handle })) {
      throw httpError(409, 'Handle is taken', [{ field: 'handle', message: 'Already taken' }]);
    }
  } else {
    handle = await allocateHandle(name || email.split('@')[0]);
  }

  const user = await User.create({
    email,
    passwordHash: await bcrypt.hash(password, SALT_ROUNDS),
    name,
    handle,
    rollno: data.rollno ? String(data.rollno).toUpperCase().trim() : null,
    avatarUrl: `https://api.dicebear.com/9.x/identicon/svg?seed=${encodeURIComponent(handle)}`,
  });

  return issueSession(user);
}

/** Email/password login. Uses a constant-ish path to avoid leaking which emails exist. */
async function login({ email, password }) {
  const user = await User.findOne({ email: String(email || '').toLowerCase().trim() });
  if (!user || !user.passwordHash) {
    throw httpError(401, 'Invalid email or password');
  }
  const ok = await bcrypt.compare(String(password || ''), user.passwordHash);
  if (!ok) {
    throw httpError(401, 'Invalid email or password');
  }
  return issueSession(user);
}

/** Returns the signed-in user's full (safe) document. */
async function me(user) {
  return user.toSafeJSON();
}

async function updateAccount(user, data) {
  const editable = ['name', 'headline', 'about', 'location', 'avatarUrl', 'isPublic'];
  for (const field of editable) {
    if (data[field] !== undefined) user[field] = data[field];
  }
  if (data.socials) {
    for (const key of ['website', 'linkedin', 'twitter']) {
      if (data.socials[key] !== undefined) user.socials[key] = data.socials[key];
    }
  }
  if (data.rollno !== undefined) {
    user.rollno = data.rollno ? String(data.rollno).toUpperCase().trim() : null;
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

async function changePassword(user, { currentPassword, newPassword }) {
  if (user.passwordHash) {
    const ok = await bcrypt.compare(String(currentPassword || ''), user.passwordHash);
    if (!ok) {
      throw httpError(400, 'Current password is incorrect', [
        { field: 'currentPassword', message: 'Incorrect' },
      ]);
    }
  }
  user.passwordHash = await bcrypt.hash(String(newPassword), SALT_ROUNDS);
  await user.save();
  return { message: 'Password updated' };
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
 * GitHub OAuth (Single Sign-On). The frontend redirects to GitHub, GitHub sends
 * the user back with `?code=`, and the frontend posts that code here.
 *
 * Signs in an existing user (matched by GitHub email or login) or creates one.
 * Also stores the access token so the project picker can list private-ish repos.
 */
async function githubOAuth(code) {
  const clientId = process.env.GITHUB_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GITHUB_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw httpError(500, 'GitHub OAuth is not configured on this server');
  }

  let accessToken;
  try {
    const tokenRes = await axios.post(
      'https://github.com/login/oauth/access_token',
      { client_id: clientId, client_secret: clientSecret, code },
      { headers: { Accept: 'application/json' }, timeout: 15000 },
    );
    accessToken = tokenRes.data?.access_token;
  } catch (_err) {
    throw httpError(502, 'Could not reach GitHub to complete sign-in');
  }
  if (!accessToken) {
    throw httpError(400, 'GitHub rejected the authorization code');
  }

  const ghHeaders = { Authorization: `Bearer ${accessToken}`, Accept: 'application/vnd.github+json' };
  const [profileRes, emailsRes] = await Promise.all([
    axios.get('https://api.github.com/user', { headers: ghHeaders, timeout: 15000 }),
    axios.get('https://api.github.com/user/emails', { headers: ghHeaders, timeout: 15000 })
      .catch(() => ({ data: [] })),
  ]);

  const profile = profileRes.data;
  const primaryEmail = (emailsRes.data || []).find((e) => e.primary && e.verified)?.email
    || profile.email
    || `${profile.login}@users.noreply.github.com`;

  let user = await User.findOne({
    $or: [{ email: primaryEmail.toLowerCase() }, { 'githubAuth.login': profile.login }],
  });

  if (!user) {
    user = new User({
      email: primaryEmail.toLowerCase(),
      name: profile.name || profile.login,
      handle: await allocateHandle(profile.login),
      avatarUrl: profile.avatar_url || '',
      about: profile.bio || '',
      location: profile.location || '',
      socials: { website: profile.blog || '', linkedin: '', twitter: '' },
    });
  }

  // GitHub SSO doubles as verification for the development pillar
  user.githubAuth.login = profile.login;
  user.githubAuth.accessToken = accessToken;
  user.githubAuth.connectedAt = new Date();
  user.platforms.github.username = profile.login;
  user.platforms.github.verified = true;
  user.platforms.github.verifiedAt = new Date();
  await user.save();

  return issueSession(user);
}

/**
 * Builds the URL the frontend sends the browser to for GitHub SSO.
 *
 * The caller-supplied redirect_uri is only honoured when it points at our own
 * frontend; otherwise an attacker could have GitHub deliver the authorization
 * code to a host they control.
 */
function githubAuthorizeUrl(redirectUri) {
  const clientId = process.env.GITHUB_OAUTH_CLIENT_ID;
  if (!clientId) throw httpError(500, 'GitHub OAuth is not configured on this server');

  const configured = process.env.GITHUB_OAUTH_REDIRECT_URI || '';
  const frontend = process.env.FRONTEND_URL || 'http://localhost:5173';

  let redirect = configured;
  if (redirectUri) {
    if (String(redirectUri).startsWith(frontend)) redirect = redirectUri;
    else {
      throw httpError(400, 'redirect_uri must point at this application');
    }
  }

  const params = new URLSearchParams({
    client_id: clientId,
    scope: 'read:user user:email public_repo',
    redirect_uri: redirect,
  });
  return { url: `https://github.com/login/oauth/authorize?${params.toString()}` };
}

/**
 * Issues (or reuses) the long-lived token the Chrome extension stores so it can
 * save questions without the user pasting their session JWT.
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
  signup,
  login,
  me,
  updateAccount,
  changePassword,
  checkHandle,
  githubOAuth,
  githubAuthorizeUrl,
  getExtensionToken,
  revokeExtensionToken,
  allocateHandle,
};
