const { verifyToken, createClerkClient } = require('@clerk/backend');
const httpError = require('../utils/httpError');

/**
 * Thin wrapper around Clerk so the rest of the backend never imports the SDK
 * directly. Accounts, passwords, social providers (Google, GitHub, ...) and MFA
 * all live in Clerk; we keep only a local `User` mirror for the data that is
 * ours (portfolio, platform handles, workspace, C-Score).
 */

let _client = null;

function isConfigured() {
  return Boolean(process.env.CLERK_SECRET_KEY);
}

/** Lazily built so the module can be imported without Clerk configured. */
function client() {
  if (!isConfigured()) {
    throw httpError(500, 'Clerk is not configured on this server (CLERK_SECRET_KEY missing)');
  }
  if (!_client) {
    _client = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
  }
  return _client;
}

/**
 * Only tokens minted for our own frontend are accepted. Without this a valid
 * Clerk token issued to a *different* application on the same instance could be
 * replayed against this API.
 *
 * Clerk compares the token's `azp` claim against this list by exact string, so
 * every origin the app is genuinely served from has to appear. Three sources:
 *
 *   - `FRONTEND_URL`, the primary origin;
 *   - the literal entries of `ALLOWED_ORIGINS`, since an origin already trusted
 *     for CORS is by definition a legitimate party. Wildcard patterns are skipped
 *     because `azp` matching cannot express them;
 *   - `CLERK_AUTHORIZED_PARTIES`, for anything the two above do not cover.
 *
 * Getting this wrong is the single most common cause of "Authentication required"
 * on a correctly signed-in user, which is why verifyClerkToken logs the mismatch
 * explicitly rather than letting it read as a bad token.
 */
function authorizedParties() {
  const parties = [process.env.FRONTEND_URL || 'http://localhost:5173'];

  for (const raw of String(process.env.ALLOWED_ORIGINS || '').split(',')) {
    const entry = raw.trim();
    if (entry && !entry.includes('*')) parties.push(entry);
  }

  if (process.env.CLERK_AUTHORIZED_PARTIES) {
    parties.push(...process.env.CLERK_AUTHORIZED_PARTIES.split(',').map((p) => p.trim()));
  }

  // Exact-match comparison, so a trailing slash would silently never match
  return [...new Set(parties.filter(Boolean).map((p) => p.replace(/\/+$/, '')))];
}

/**
 * Failure reasons that mean *this server* cannot verify anything: a bad secret
 * key, or JWKS that will not resolve. No token would succeed, so answering 401
 * ("your credentials are wrong") is actively misleading — these are raised so the
 * caller sees a 503 instead.
 */
const SERVER_CONFIG_REASONS = new Set([
  'secret-key-invalid',
  'jwk-local-missing',
  'jwk-remote-failed-to-load',
  'jwk-remote-invalid',
  'jwk-remote-missing',
  'jwk-failed-to-resolve',
  'jwk-kid-mismatch',
]);

/**
 * Reasons that are the operator's problem but still specific to the token
 * presented, so the request stays a 401. These used to be swallowed silently,
 * which made a misconfigured instance indistinguishable from a signed-out user.
 */
const MISCONFIGURATION_REASONS = new Set([
  'token-invalid-authorized-parties',
  'token-invalid-signature',
  'token-invalid-algorithm',
]);

/**
 * Reads `azp` and `iss` out of a token *without* verifying it, purely so a
 * diagnostic can name what was received. Never used for a trust decision.
 */
function peekClaims(token) {
  try {
    const [, payload] = String(token).split('.');
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch (_error) {
    return {};
  }
}

/**
 * Throttles repeated diagnostics. A broken deployment produces one of these per
 * request, and the useful signal is the first occurrence, not the thousandth.
 */
const lastLoggedAt = new Map();

function logOnce(key, lines) {
  const now = Date.now();
  if (now - (lastLoggedAt.get(key) || 0) < 60_000) return;
  lastLoggedAt.set(key, now);
  lines.forEach((line) => console.error(line));
}

/**
 * Verifies a Clerk session token.
 *
 * Networkless when CLERK_JWT_KEY (the instance PEM public key) is set; otherwise
 * falls back to fetching JWKS with the secret key, which costs a round trip on
 * cold cache.
 *
 * @param {string} token
 * @returns {Promise<Object|null>} JWT payload, or null when the token is not a
 *   valid Clerk token (callers then try other credential types).
 */
async function verifyClerkToken(token) {
  if (!token) return null;

  if (!isConfigured() && !process.env.CLERK_JWT_KEY) {
    logOnce('unconfigured', [
      '[CLERK] A bearer token was presented but neither CLERK_SECRET_KEY nor '
      + 'CLERK_JWT_KEY is set, so no session can be verified. Every authenticated '
      + 'request will fail until one is configured.',
    ]);
    return null;
  }

  const parties = authorizedParties();

  try {
    return await verifyToken(token, {
      jwtKey: process.env.CLERK_JWT_KEY || undefined,
      secretKey: process.env.CLERK_SECRET_KEY || undefined,
      authorizedParties: parties,
    });
  } catch (error) {
    const reason = error?.reason;

    /*
     * `token-invalid` means "not a JWT at all". The extension pairing token is a
     * 48-hex string and lands here on every extension request, so this case has
     * to stay quiet or the logs become useless.
     */
    if (!reason || reason === 'token-invalid') return null;

    if (SERVER_CONFIG_REASONS.has(reason)) {
      logOnce(reason, [
        `[CLERK] Cannot verify sessions: ${error.message} (reason: ${reason})`,
        '[CLERK] Check CLERK_SECRET_KEY / CLERK_JWT_KEY match the Clerk instance '
        + 'this frontend signs in against.',
      ]);
      throw httpError(503, 'Authentication service is misconfigured');
    }

    if (reason === 'token-invalid-authorized-parties') {
      const { azp, iss } = peekClaims(token);
      logOnce(reason, [
        '[CLERK] Rejected a validly signed session token because its azp claim '
        + 'is not an authorized party.',
        `[CLERK]   token azp: ${azp === undefined ? '(absent)' : JSON.stringify(azp)}`,
        `[CLERK]   accepted:  ${parties.join(', ') || '(none)'}`,
        `[CLERK]   issuer:    ${iss || '(unknown)'}`,
        azp === undefined
          ? '[CLERK] The token carries no azp claim. This happens with tokens not '
            + 'minted in a browser context; add the calling origin via '
            + 'CLERK_AUTHORIZED_PARTIES or verify the frontend is using Clerk\'s '
            + 'default session token.'
          : `[CLERK] Set FRONTEND_URL (or CLERK_AUTHORIZED_PARTIES) to ${azp} so the `
            + 'origin your frontend is actually served from is accepted.',
      ]);
      return null;
    }

    if (MISCONFIGURATION_REASONS.has(reason)) {
      logOnce(reason, [
        `[CLERK] Session token rejected: ${error.message} (reason: ${reason})`,
        '[CLERK] This usually means the frontend and backend point at different '
        + 'Clerk instances (publishable key vs secret key).',
      ]);
      return null;
    }

    // Expired / not-yet-valid: normal and self-correcting, the client refreshes.
    return null;
  }
}

/** Fetches the full Clerk user record. */
async function getClerkUser(clerkUserId) {
  return client().users.getUser(clerkUserId);
}

/** Primary email address, or the first verified one as a fallback. */
function primaryEmailOf(clerkUser) {
  const addresses = clerkUser?.emailAddresses || [];
  const primary = addresses.find((a) => a.id === clerkUser.primaryEmailAddressId);
  const chosen = primary || addresses.find((a) => a.verification?.status === 'verified') || addresses[0];
  return chosen?.emailAddress ? String(chosen.emailAddress).toLowerCase().trim() : null;
}

/**
 * Every email address Clerk has *verified* for this user, lowercased.
 *
 * Only verified addresses are trustworthy for identity decisions (claiming a
 * roll number by institute email, matching a sheet collaborator invite), which
 * is precisely the guarantee our old email/password signup could not make.
 */
function verifiedEmailsOf(clerkUser) {
  return (clerkUser?.emailAddresses || [])
    .filter((a) => a.verification?.status === 'verified')
    .map((a) => String(a.emailAddress).toLowerCase().trim());
}

/** Display name assembled from whatever Clerk has. */
function displayNameOf(clerkUser) {
  const parts = [clerkUser?.firstName, clerkUser?.lastName].filter(Boolean);
  if (parts.length) return parts.join(' ');
  return clerkUser?.username || primaryEmailOf(clerkUser)?.split('@')[0] || 'Developer';
}

/** The external accounts (social connections) linked in Clerk. */
function externalAccountsOf(clerkUser) {
  return (clerkUser?.externalAccounts || []).map((account) => ({
    // Clerk reports these as `oauth_github`, `oauth_google`, ...
    provider: String(account.provider || '').replace(/^oauth_/, ''),
    username: account.username || '',
    email: account.emailAddress || '',
  }));
}

/**
 * Retrieves the OAuth access token Clerk holds for a social connection, so the
 * GitHub project picker can call the GitHub API on the user's behalf without us
 * ever storing a token ourselves.
 *
 * @param {string} clerkUserId
 * @param {string} provider e.g. 'github', 'google'
 * @returns {Promise<string|null>}
 */
async function getOauthAccessToken(clerkUserId, provider) {
  try {
    const response = await client().users.getUserOauthAccessToken(clerkUserId, provider);
    // Paginated responses expose `.data`; older shapes returned a bare array
    const entries = Array.isArray(response) ? response : response?.data || [];
    return entries[0]?.token || null;
  } catch (error) {
    console.error(`[CLERK] Could not read ${provider} token for ${clerkUserId}: ${error.message}`);
    return null;
  }
}

/** Deletes the account in Clerk (used when a user deletes from our UI). */
async function deleteClerkUser(clerkUserId) {
  return client().users.deleteUser(clerkUserId);
}

module.exports = {
  isConfigured,
  authorizedParties,
  verifyClerkToken,
  getClerkUser,
  getOauthAccessToken,
  deleteClerkUser,
  primaryEmailOf,
  verifiedEmailsOf,
  displayNameOf,
  externalAccountsOf,
};
