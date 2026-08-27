const jwt = require('jsonwebtoken');

const DEFAULT_EXPIRY = '30d';

function getSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    const err = new Error('JWT_SECRET is not configured');
    err.statusCode = 500;
    throw err;
  }
  return secret;
}

function signToken(payload, expiresIn = process.env.JWT_EXPIRES_IN || DEFAULT_EXPIRY) {
  return jwt.sign(payload, getSecret(), { expiresIn });
}

/** Returns the decoded payload, or null when the token is missing/invalid/expired. */
function verifyToken(token) {
  if (!token) return null;
  try {
    return jwt.verify(token, getSecret());
  } catch (_err) {
    return null;
  }
}

/** Pulls a bearer token out of the Authorization header. */
function extractBearer(req) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return null;
  return header.slice(7).trim() || null;
}

module.exports = { signToken, verifyToken, extractBearer };
