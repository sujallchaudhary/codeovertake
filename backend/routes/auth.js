const express = require('express');
const { query } = require('express-validator');
const { asyncHandler, validate, requireAuth } = require('../middlewares');
const ctrl = require('../controllers/authController');

const router = express.Router();

/**
 * There are no /signup or /login routes: Clerk owns credentials, social sign-in
 * (Google, GitHub, ...), MFA and password resets. The frontend authenticates
 * with Clerk and sends the resulting session token as a bearer.
 */

// Public: tells the frontend whether auth is wired up on this deployment
router.get('/config', asyncHandler(ctrl.config));

router.get(
  '/check-handle',
  [query('handle').trim().notEmpty().withMessage('handle is required')],
  validate,
  asyncHandler(ctrl.checkHandle),
);

// Authenticated: our local mirror of the Clerk account
router.get('/me', requireAuth, asyncHandler(ctrl.me));
router.put('/me', requireAuth, asyncHandler(ctrl.updateAccount));

/**
 * Pulls the latest profile and social connections from Clerk on demand.
 *
 * The `user.updated` webhook normally does this, but that needs a publicly
 * reachable URL - so in local development, and immediately after linking a
 * provider, this gives the UI a way to refresh without waiting.
 */
router.post('/sync', requireAuth, asyncHandler(ctrl.syncFromClerk));

// Browser-extension pairing token
router.get('/extension-token', requireAuth, asyncHandler(ctrl.extensionToken));
router.post('/extension-token/rotate', requireAuth, asyncHandler(ctrl.revokeExtensionToken));

module.exports = router;
