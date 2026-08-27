/**
 * CORS origin rules.
 *
 * Beyond the single production frontend we need to allow two other classes of
 * caller:
 *
 *   - browser extensions, whose origin (`chrome-extension://<id>`) differs per
 *     install and so cannot be listed;
 *   - preview deployments, where a per-PR frontend on a generated hostname needs
 *     to reach the matching per-PR backend. Without this, a preview is deployed
 *     but unusable from the browser, which defeats the point.
 *
 * `ALLOWED_ORIGINS` is a comma-separated list that may contain `*` as a single
 * hostname-label wildcard, e.g. `https://*.vercel.app`.
 */

const EXTENSION_ORIGIN = /^(chrome-extension|moz-extension):\/\//;

/**
 * Converts one pattern into a RegExp.
 *
 * Everything is escaped first, so only `*` is special. It expands to `[^.]+` —
 * a single label — rather than `.*`, so `https://*.vercel.app` cannot be
 * satisfied by an attacker-controlled `https://evil.vercel.app.example.com`.
 */
function patternToRegExp(pattern) {
  const escaped = String(pattern)
    .trim()
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\\\*/g, '[^.]+');
  return new RegExp(`^${escaped}$`);
}

function parsePatterns(raw) {
  if (!raw) return [];
  return String(raw)
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map(patternToRegExp);
}

/**
 * Builds the `origin` callback for the cors middleware.
 *
 * @param {{frontendUrl?:string, allowedOrigins?:string}} env
 * @returns {Function} (origin, callback) => void
 */
function buildOriginChecker(env = process.env) {
  const frontendUrl = (env.FRONTEND_URL || 'http://localhost:5173').replace(/\/+$/, '');
  const patterns = parsePatterns(env.ALLOWED_ORIGINS);

  return function originChecker(origin, callback) {
    // Same-origin and server-to-server requests send no Origin header
    if (!origin) return callback(null, true);

    const normalized = origin.replace(/\/+$/, '');
    if (normalized === frontendUrl) return callback(null, true);
    if (EXTENSION_ORIGIN.test(normalized)) return callback(null, true);
    if (patterns.some((pattern) => pattern.test(normalized))) return callback(null, true);

    // Reject by omitting the CORS headers rather than throwing, so the browser
    // reports a clean CORS error instead of a 500.
    return callback(null, false);
  };
}

module.exports = { buildOriginChecker, patternToRegExp, parsePatterns };
