const express = require('express');
const { body, param } = require('express-validator');
const {
  asyncHandler, validate, requireAuth, optionalAuth,
} = require('../middlewares');
const ctrl = require('../controllers/portfolioController');

const router = express.Router();

/* ------------------------------------------------------------- public reads */

// Literal paths before /u/:handle so they are not shadowed
router.get('/platforms', asyncHandler(ctrl.platforms));
router.get('/leaderboard', asyncHandler(ctrl.leaderboard));

router.get(
  '/u/:handle',
  optionalAuth,
  [param('handle').trim().notEmpty().withMessage('handle is required')],
  validate,
  asyncHandler(ctrl.publicProfile),
);

router.get(
  '/u/:handle/projects/:projectId',
  optionalAuth,
  [param('projectId').isMongoId().withMessage('Invalid project id')],
  validate,
  asyncHandler(ctrl.getProject),
);

router.post(
  '/u/:handle/projects/:projectId/upvote',
  requireAuth,
  [param('projectId').isMongoId().withMessage('Invalid project id')],
  validate,
  asyncHandler(ctrl.upvoteProject),
);

/* ------------------------------------------------------------- authenticated */

router.use(requireAuth);

// On-demand stats refresh (15 minute cooldown unless force=true)
router.post('/sync', asyncHandler(ctrl.sync));

/* Platform connections */
const platformParam = [param('platform').trim().notEmpty().withMessage('platform is required')];

router.put(
  '/platforms/:platform',
  [...platformParam, body('username').trim().notEmpty().withMessage('username is required')],
  validate,
  asyncHandler(ctrl.setPlatform),
);
router.get('/platforms/:platform/verification', platformParam, validate, asyncHandler(ctrl.verificationInfo));
router.post('/platforms/:platform/verify', platformParam, validate, asyncHandler(ctrl.verifyPlatform));
router.delete('/platforms/:platform', platformParam, validate, asyncHandler(ctrl.removePlatform));

/* Projects */
router.get('/github/repos', asyncHandler(ctrl.githubRepos));
router.post(
  '/projects',
  [body('title').trim().notEmpty().withMessage('Project title is required')],
  validate,
  asyncHandler(ctrl.addProject),
);
router.put(
  '/projects/reorder',
  [body('order').isArray().withMessage('order must be an array of project ids')],
  validate,
  asyncHandler(ctrl.reorderProjects),
);

const projectParam = [param('projectId').isMongoId().withMessage('Invalid project id')];
router.put('/projects/:projectId', projectParam, validate, asyncHandler(ctrl.updateProject));
router.delete('/projects/:projectId', projectParam, validate, asyncHandler(ctrl.deleteProject));

/* Education */
const itemParam = [param('itemId').isMongoId().withMessage('Invalid entry id')];
router.post(
  '/education',
  [body('institute').trim().notEmpty().withMessage('Institute is required')],
  validate,
  asyncHandler(ctrl.addEducation),
);
router.put('/education/:itemId', itemParam, validate, asyncHandler(ctrl.updateEducation));
router.delete('/education/:itemId', itemParam, validate, asyncHandler(ctrl.deleteEducation));

/* Experience */
router.post(
  '/experience',
  [body('company').trim().notEmpty().withMessage('Company is required')],
  validate,
  asyncHandler(ctrl.addExperience),
);
router.put('/experience/:itemId', itemParam, validate, asyncHandler(ctrl.updateExperience));
router.delete('/experience/:itemId', itemParam, validate, asyncHandler(ctrl.deleteExperience));

module.exports = router;
