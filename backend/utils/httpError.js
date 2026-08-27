/**
 * Creates an Error decorated the way `middlewares/errorHandler` expects.
 *
 *   throw httpError(404, 'Sheet not found');
 *   throw httpError(400, 'Invalid input', [{ field: 'url', message: 'required' }]);
 */
function httpError(statusCode, message, errors = null) {
  const err = new Error(message);
  err.statusCode = statusCode;
  if (errors) err.errors = errors;
  return err;
}

module.exports = httpError;
