/**
 * MongoDB connection-string helpers for preview environments.
 *
 * Each PR preview gets its own *database* inside the existing cluster rather than
 * its own cluster. A Mongo database is essentially free to create, so previews
 * are fully isolated from production data at no extra infrastructure cost, and
 * teardown is a single dropDatabase call.
 */

/** Mongo forbids these in database names. */
const ILLEGAL_DB_CHARS = /[/\\. "$*<>:|?]/g;

/**
 * Returns the same connection string pointed at a different database, keeping
 * credentials, host list and query options intact.
 *
 * @param {string} uri e.g. mongodb+srv://u:p@host/prod?retryWrites=true
 * @param {string} databaseName
 * @returns {string}
 */
function withDatabase(uri, databaseName) {
  if (!uri) throw new Error('withDatabase: a base URI is required');
  if (!databaseName) throw new Error('withDatabase: a database name is required');

  const safeName = sanitiseDatabaseName(databaseName);

  // The URL parser handles mongodb:// and mongodb+srv:// fine, and preserves
  // the query string that Atlas URIs always carry.
  const parsed = new URL(uri);
  parsed.pathname = `/${safeName}`;
  return parsed.toString();
}

/** Strips characters Mongo rejects and enforces the 63-byte name limit. */
function sanitiseDatabaseName(name) {
  const cleaned = String(name).replace(ILLEGAL_DB_CHARS, '_');
  if (!cleaned) throw new Error(`Database name "${name}" is empty after sanitising`);
  return cleaned.slice(0, 63);
}

/**
 * Deterministic database name for a pull request, so deploy and teardown derive
 * the same value without passing it between workflows.
 */
function previewDatabaseName(prNumber, prefix = 'codeovertake_pr') {
  const number = String(prNumber).replace(/\D/g, '');
  if (!number) throw new Error(`Invalid PR number: ${prNumber}`);
  return sanitiseDatabaseName(`${prefix}_${number}`);
}

/** Hides credentials so a URI can safely appear in logs. */
function redactUri(uri) {
  try {
    const parsed = new URL(uri);
    if (parsed.password) parsed.password = '***';
    if (parsed.username) parsed.username = '***';
    return parsed.toString();
  } catch (_error) {
    return '<unparseable uri>';
  }
}

module.exports = {
  withDatabase, previewDatabaseName, sanitiseDatabaseName, redactUri,
};
