const express = require('express');
const { body, param } = require('express-validator');
const { asyncHandler, validate, optionalAuth } = require('../middlewares');
const ctrl = require('../controllers/studentController');
const { getAllPlatforms } = require('../platforms');

const router = express.Router();
const platforms = getAllPlatforms();

// GET /api/students/branches
router.get('/branches', asyncHandler(ctrl.getBranches));

// GET /api/students/search?q=...
router.get('/search', asyncHandler(ctrl.searchStudents));

// GET /api/students/validate-username/:platform/:username
router.get(
  '/validate-username/:platform/:username',
  [
    param('platform').trim().notEmpty(),
    param('username').trim().notEmpty(),
  ],
  validate,
  asyncHandler(ctrl.validateUsername),
);

// GET /api/students/lookup/:rollno
router.get(
  '/lookup/:rollno',
  [param('rollno').trim().notEmpty().isAlphanumeric()],
  validate,
  asyncHandler(ctrl.lookupStudent),
);

// POST /api/students/register
router.post(
  '/register',
  [
    body('rollno').trim().notEmpty().isAlphanumeric().withMessage('Roll number is required'),
    body('name').trim().notEmpty().withMessage('Name is required'),
    body('branch').trim().notEmpty().withMessage('Branch is required'),
    body('year').isInt({ min: 2000, max: 2100 }).withMessage('Valid year is required'),
    ...platforms.map((p) => body(p.key).optional({ values: 'falsy' }).trim()),
  ],
  validate,
  asyncHandler(ctrl.registerStudent),
);

// GET /api/students/:rollno
router.get(
  '/:rollno',
  [param('rollno').trim().notEmpty()],
  validate,
  asyncHandler(ctrl.getStudent),
);

// PUT /api/students/:rollno/usernames
// optionalAuth, not requireAuth: an unclaimed record is still editable without
// an account (original behaviour), while a claimed one needs its owner signed in.
router.put(
  '/:rollno/usernames',
  optionalAuth,
  [
    param('rollno').trim().notEmpty(),
    ...platforms.map((p) => body(p.key).optional({ values: 'falsy' }).trim()),
  ],
  validate,
  asyncHandler(ctrl.updateUsernames),
);

// POST /api/students/:rollno/restore
router.post(
  '/:rollno/restore',
  optionalAuth,
  [
    param('rollno').trim().notEmpty(),
    body('index').isInt({ min: 0 }).withMessage('History index is required'),
  ],
  validate,
  asyncHandler(ctrl.restoreUsernames),
);

// GET /api/students/:rollno/history
router.get(
  '/:rollno/history',
  [param('rollno').trim().notEmpty()],
  validate,
  asyncHandler(ctrl.getHistory),
);

// GET /api/students/:rollno/heatmap
router.get(
  '/:rollno/heatmap',
  [param('rollno').trim().notEmpty()],
  validate,
  asyncHandler(ctrl.getHeatmap),
);

module.exports = router;
