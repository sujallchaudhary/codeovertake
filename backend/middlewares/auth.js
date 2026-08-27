const User = require('../models/User');
const { verifyToken, extractBearer } = require('../utils/jwt');

/**
 * Resolves a bearer token to a user.
 *
 * Two credential types are accepted:
 *   1. a session JWT issued by /api/auth/login (the web app)
 *   2. a long-lived extension pairing token (the browser extension, which has
 *      no way to refresh a short-lived JWT)
 *
 * @returns {Promise<import('mongoose').Document|null>}
 */
async function resolveUserFromToken(token) {
  if (!token) return null;

  const payload = verifyToken(token);
  if (payload?.sub) {
    return User.findById(payload.sub);
  }

  // Not a JWT: fall back to an extension pairing token. These are 48-char hex,
  // so cheaply reject anything that cannot be one before hitting the database.
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

module.exports = { requireAuth, optionalAuth, resolveUserFromToken };
