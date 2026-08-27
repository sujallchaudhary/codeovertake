const User = require('../models/User');
const { verifyToken, extractBearer } = require('../utils/jwt');

/**
 * Rejects the request with 401 unless a valid bearer token resolves to a user.
 * On success attaches `req.user` (Mongoose document) and `req.userId`.
 */
async function requireAuth(req, res, next) {
  try {
    const payload = verifyToken(extractBearer(req));
    if (!payload?.sub) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    const user = await User.findById(payload.sub);
    if (!user) {
      return res.status(401).json({ error: 'Account no longer exists' });
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
    const payload = verifyToken(extractBearer(req));
    if (payload?.sub) {
      const user = await User.findById(payload.sub);
      if (user) {
        req.user = user;
        req.userId = String(user._id);
      }
    }
    return next();
  } catch (_error) {
    // Never block a public route because of a bad token
    return next();
  }
}

module.exports = { requireAuth, optionalAuth };
