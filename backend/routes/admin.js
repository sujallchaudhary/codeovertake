const express = require('express');
const rateLimit = require('express-rate-limit');
const { body, param, query } = require('express-validator');
const { asyncHandler, validate } = require('../middlewares');
const ctrl = require('../controllers/adminController');
const adminAuth = require('../middlewares/adminAuth');

const router = express.Router();

/**
 * Two rate limits, because the traffic is not homogeneous.
 *
 * The panel makes ordinary reads and edits and needs a workable budget; kicking
 * off a full student refresh is expensive enough that it should stay rare. The
 * original single 3-per-15-minutes limit on the whole router would have made the
 * panel unusable after three clicks.
 */
const panelLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many admin requests. Please slow down.' },
});

const jobLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many job triggers. Please wait before running more.' },
});

// Everything here is privileged: a signed-in admin, or the shared secret.
router.use(panelLimiter);
router.use(adminAuth);

const rollnoParam = [param('rollno').trim().notEmpty().withMessage('Roll number is required')];
const handleParam = [param('handle').trim().notEmpty().withMessage('Handle is required')];
const idParam = [param('id').isMongoId().withMessage('Invalid id')];

/* -------------------------------------------------------- panel entry points */

router.get('/whoami', asyncHandler(ctrl.whoami));
router.get('/overview', asyncHandler(ctrl.overview));

/* ------------------------------------------------------------------ students */

router.get('/students', asyncHandler(ctrl.listStudents));
router.get('/students/:rollno', rollnoParam, validate, asyncHandler(ctrl.getStudent));
router.put('/students/:rollno', rollnoParam, validate, asyncHandler(ctrl.updateStudent));
router.post('/students/:rollno/refresh', rollnoParam, validate, asyncHandler(ctrl.refreshStudent));
router.delete('/students/:rollno', rollnoParam, validate, asyncHandler(ctrl.deleteStudent));

/* --------------------------------------------------------------------- users */

router.get('/users', asyncHandler(ctrl.listUsers));
router.get('/users/:handle', handleParam, validate, asyncHandler(ctrl.getUser));
router.put(
  '/users/:handle/admin',
  [...handleParam, body('isAdmin').isBoolean().withMessage('isAdmin must be a boolean')],
  validate,
  asyncHandler(ctrl.setUserAdmin),
);
router.put(
  '/users/:handle/suspend',
  [...handleParam, body('suspended').isBoolean().withMessage('suspended must be a boolean')],
  validate,
  asyncHandler(ctrl.setUserSuspended),
);
router.delete('/users/:handle', handleParam, validate, asyncHandler(ctrl.deleteUser));

/* -------------------------------------------------------------------- claims */

router.get('/claims', asyncHandler(ctrl.listClaims));
// Pass no handle to release the claim entirely
router.post('/claims/:rollno/reassign', rollnoParam, validate, asyncHandler(ctrl.reassignClaim));

/* ------------------------------------------------------------------ problems */

router.get('/problems', asyncHandler(ctrl.listProblems));
router.put('/problems/:id', idParam, validate, asyncHandler(ctrl.updateProblem));
router.post('/problems/:id/refresh', idParam, validate, asyncHandler(ctrl.refreshProblem));
router.delete('/problems/:id', idParam, validate, asyncHandler(ctrl.deleteProblem));

/* -------------------------------------------------------------------- sheets */

router.get('/sheets', asyncHandler(ctrl.listSheets));
router.put(
  '/sheets/:idOrSlug/curated',
  [
    param('idOrSlug').trim().notEmpty(),
    body('isCurated').isBoolean().withMessage('isCurated must be a boolean'),
  ],
  validate,
  asyncHandler(ctrl.setSheetCurated),
);
router.delete(
  '/sheets/:idOrSlug',
  [param('idOrSlug').trim().notEmpty()],
  validate,
  asyncHandler(ctrl.deleteSheet),
);

/* ------------------------------------------------------------------ contests */

router.get('/contests', asyncHandler(ctrl.listContests));
router.delete('/contests/:id', idParam, validate, asyncHandler(ctrl.deleteContest));

/* ---------------------------------------------------------------------- jobs */

router.get('/jobs', asyncHandler(ctrl.listJobs));
router.post(
  '/jobs/:name/run',
  jobLimiter,
  [param('name').trim().notEmpty().withMessage('Job name is required')],
  validate,
  asyncHandler(ctrl.runJob),
);

/**
 * Legacy alias for the student refresh, kept because external schedulers and the
 * original docs point at it. Equivalent to POST /jobs/student-update/run.
 */
router.post('/update', jobLimiter, asyncHandler(ctrl.triggerUpdate));

/* --------------------------------------------------------------------- audit */

router.get(
  '/audit',
  [query('targetType').optional({ values: 'falsy' }).trim()],
  validate,
  asyncHandler(ctrl.auditLog),
);

module.exports = router;
