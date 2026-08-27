const express = require('express');
const rateLimit = require('express-rate-limit');
const { body, param } = require('express-validator');
const {
  asyncHandler, validate, requireAuth, optionalAuth,
} = require('../middlewares');
const adminAuth = require('../middlewares/adminAuth');
const ctrl = require('../controllers/claimController');

const router = express.Router();

/**
 * Claiming is the bridge between the pre-existing, owner-less `Student` records
 * and real accounts. See services/claimService.js for the three proof paths.
 */

/**
 * Claim endpoints are rate limited: status lookups would otherwise let someone
 * enumerate roll numbers and learn which platforms each record has, and the
 * verify step performs an outbound fetch per call.
 */
const claimLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 40,
  message: { error: 'Too many claim requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

router.use(claimLimiter);

const rollnoParam = [param('rollno').trim().notEmpty().withMessage('Roll number is required')];

// What this account owns already
router.get('/mine', requireAuth, asyncHandler(ctrl.mine));

// optionalAuth: anonymous callers see whether a profile is claimed, signed-in
// callers additionally get the proof options available to them.
router.get('/:rollno', optionalAuth, rollnoParam, validate, asyncHandler(ctrl.status));

// Path 1: instant, the record's handle is already verified on their portfolio
router.post(
  '/:rollno/claim-verified',
  requireAuth,
  [...rollnoParam, body('platform').trim().notEmpty().withMessage('platform is required')],
  validate,
  asyncHandler(ctrl.claimVerified),
);

// Path 2: one-time code pasted into the platform profile on the record
router.post(
  '/:rollno/start',
  requireAuth,
  [...rollnoParam, body('platform').trim().notEmpty().withMessage('platform is required')],
  validate,
  asyncHandler(ctrl.start),
);
router.post('/:rollno/verify', requireAuth, rollnoParam, validate, asyncHandler(ctrl.verify));

// Path 3: verified institute email (only when INSTITUTE_EMAIL_DOMAIN is set)
router.post('/:rollno/claim-email', requireAuth, rollnoParam, validate, asyncHandler(ctrl.claimEmail));

// Give the profile up again
router.delete('/:rollno', requireAuth, rollnoParam, validate, asyncHandler(ctrl.release));

// Admin escape hatch: reassign to a handle, or pass none to unclaim
router.post(
  '/:rollno/admin-reassign',
  adminAuth,
  rollnoParam,
  validate,
  asyncHandler(ctrl.adminReassign),
);

module.exports = router;
