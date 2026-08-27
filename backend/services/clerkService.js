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
 */
function authorizedParties() {
  const parties = [process.env.FRONTEND_URL || 'http://localhost:5173'];
  if (process.env.CLERK_AUTHORIZED_PARTIES) {
    parties.push(...process.env.CLERK_AUTHORIZED_PARTIES.split(',').map((p) => p.trim()));
  }
  return parties.filter(Boolean);
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
  if (!isConfigured() && !process.env.CLERK_JWT_KEY) return null;

  try {
    return await verifyToken(token, {
      jwtKey: process.env.CLERK_JWT_KEY || undefined,
      secretKey: process.env.CLERK_SECRET_KEY || undefined,
      authorizedParties: authorizedParties(),
    });
  } catch (_error) {
    // Expired, malformed, wrong audience, or simply not a Clerk token at all
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
  verifyClerkToken,
  getClerkUser,
  getOauthAccessToken,
  deleteClerkUser,
  primaryEmailOf,
  verifiedEmailsOf,
  displayNameOf,
  externalAccountsOf,
};
