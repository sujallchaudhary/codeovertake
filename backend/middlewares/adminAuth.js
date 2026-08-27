const crypto = require('crypto');
const { resolveUserFromToken, extractBearer } = require('./auth');

/**
 * Constant-time secret comparison, so a timing side channel cannot be used to
 * recover ADMIN_SECRET byte by byte.
 */
function secretMatches(provided, expected) {
  if (typeof provided !== 'string' || !provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  // timingSafeEqual throws on length mismatch, so compare lengths separately
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * Gate for privileged endpoints.
 *
 * Two ways in, because they serve different callers:
 *
 *   1. A signed-in admin (`User.isAdmin`) — the admin panel in the browser. This
 *      is the path that produces a real actor in the audit log.
 *   2. The `x-admin-secret` header — scripts, cron and CI, which have no session.
 *      Marked as `req.adminViaSecret` so the audit trail can tell the two apart.
 *
 * Kept as one middleware so a route cannot accidentally accept only the weaker
 * of the two.
 */
async function adminAuth(req, res, next) {
  try {
    // --- 1. Signed-in admin --------------------------------------------------
    const token = extractBearer(req);
    if (token) {
      const user = await resolveUserFromToken(token);
      if (user?.isAdmin && !user.suspended) {
        req.user = user;
        req.userId = String(user._id);
        req.adminViaSecret = false;
        return next();
      }
      // A valid non-admin session must not fall through to the secret check:
      // answer directly so the reason is unambiguous.
      if (user) {
        return res.status(403).json({ error: 'Admin access required' });
      }
    }

    // --- 2. Shared secret ----------------------------------------------------
    const expectedSecret = process.env.ADMIN_SECRET;
    const providedSecret = req.headers['x-admin-secret'];

    if (providedSecret) {
      if (!expectedSecret) {
        return res.status(500).json({ error: 'ADMIN_SECRET is not configured' });
      }
      if (secretMatches(providedSecret, expectedSecret)) {
        req.adminViaSecret = true;
        return next();
      }
      return res.status(403).json({ error: 'Forbidden' });
    }

    return res.status(401).json({ error: 'Admin authentication required' });
  } catch (error) {
    return next(error);
  }
}

module.exports = adminAuth;
