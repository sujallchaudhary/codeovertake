const User = require('../models/User');
const clerkService = require('../services/clerkService');
const authService = require('../services/authService');

/** Pulls a bearer token out of the Authorization header. */
function extractBearer(req) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return null;
  return header.slice(7).trim() || null;
}

/**
 * Resolves a bearer token to our local User document.
 *
 * Two credential types are accepted:
 *
 *   1. A **Clerk session token** - the web app. Clerk owns the credentials, so
 *      this is the normal path for every browser request. On first sight of a
 *      Clerk id we provision the local mirror just in time; see
 *      authService.findOrCreateFromClerk for why we do not wait for the webhook.
 *
 *   2. A **48-hex extension pairing token** - the browser extension, which has
 *      no browser context in which to refresh a short-lived Clerk token.
 *
 * @returns {Promise<import('mongoose').Document|null>}
 */
async function resolveUserFromToken(token) {
  if (!token) return null;

  const payload = await clerkService.verifyClerkToken(token);
  if (payload?.sub) {
    return authService.findOrCreateFromClerk(payload.sub);
  }

  // Not a Clerk token: try an extension pairing token. Shape-gated so a random
  // malformed bearer never costs a database query.
  if (/^[a-f0-9]{48}$/i.test(token)) {
    return User.findOne({ extensionToken: token });
  }
  return null;
}

/**
 * Rejects the request with 401 unless a valid bearer token resolves to a user.
 * On success attaches `req.user` (Mongoose document) and `req.userId`.
 */
async function requireAuth(req, res, next) {
  try {
    const user = await resolveUserFromToken(extractBearer(req));
    if (!user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    req.user = user;
    req.userId = String(user._id);
    return next();
  } catch (error) {
    // A Clerk outage during just-in-time provisioning should read as an upstream
    // failure, not as bad credentials.
    if (!error.statusCode) {
      console.error('[AUTH] Could not resolve session:', error.message);
      return res.status(503).json({ error: 'Authentication service unavailable' });
    }
    return next(error);
  }
}

/**
 * Same as requireAuth but never fails: used by public endpoints that show extra
 * data (e.g. "is this in my workspace?", "did I upvote this project?") when the
 * caller happens to be signed in.
 */
async function optionalAuth(req, res, next) {
  try {
    const user = await resolveUserFromToken(extractBearer(req));
    if (user) {
      req.user = user;
      req.userId = String(user._id);
    }
    return next();
  } catch (_error) {
    // Never block a public route because of a bad token
    return next();
  }
}

module.exports = {
  requireAuth, optionalAuth, resolveUserFromToken, extractBearer,
};
