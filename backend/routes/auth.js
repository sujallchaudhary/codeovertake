const express = require('express');
const rateLimit = require('express-rate-limit');
const { body, query } = require('express-validator');
const { asyncHandler, validate, requireAuth } = require('../middlewares');
const ctrl = require('../controllers/authController');

const router = express.Router();

// Brute-force protection on the credential endpoints only
const credentialLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many attempts, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

router.post(
  '/signup',
  credentialLimiter,
  [
    body('email').isEmail().withMessage('Valid email required').normalizeEmail(),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
    body('name').trim().notEmpty().withMessage('Name is required'),
    body('handle').optional({ values: 'falsy' }).trim(),
    body('rollno').optional({ values: 'falsy' }).trim(),
  ],
  validate,
  asyncHandler(ctrl.signup),
);

router.post(
  '/login',
  credentialLimiter,
  [
    body('email').isEmail().withMessage('Valid email required').normalizeEmail(),
    body('password').notEmpty().withMessage('Password is required'),
  ],
  validate,
  asyncHandler(ctrl.login),
);

router.get(
  '/check-handle',
  [query('handle').trim().notEmpty().withMessage('handle is required')],
  validate,
  asyncHandler(ctrl.checkHandle),
);

// GitHub SSO
router.get('/github/url', asyncHandler(ctrl.githubAuthorizeUrl));
router.post(
  '/github/callback',
  credentialLimiter,
  [body('code').trim().notEmpty().withMessage('code is required')],
  validate,
  asyncHandler(ctrl.githubCallback),
);

// Authenticated
router.get('/me', requireAuth, asyncHandler(ctrl.me));
router.put('/me', requireAuth, asyncHandler(ctrl.updateAccount));
router.put(
  '/password',
  requireAuth,
  [body('newPassword').isLength({ min: 8 }).withMessage('Password must be at least 8 characters')],
  validate,
  asyncHandler(ctrl.changePassword),
);
router.get('/extension-token', requireAuth, asyncHandler(ctrl.extensionToken));
router.post('/extension-token/rotate', requireAuth, asyncHandler(ctrl.revokeExtensionToken));

module.exports = router;
