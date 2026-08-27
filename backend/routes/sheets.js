const express = require('express');
const { body, param } = require('express-validator');
const {
  asyncHandler, validate, requireAuth, optionalAuth,
} = require('../middlewares');
const ctrl = require('../controllers/sheetController');

const router = express.Router();

const sheetParam = [param('idOrSlug').trim().notEmpty().withMessage('Sheet id or slug is required')];

/* ---------------------------------------------------------------- public reads
 * optionalAuth so signed-in callers additionally get their own progress,
 * follow state and edit permissions folded into the response.
 */
router.get('/', optionalAuth, asyncHandler(ctrl.list));

router.post(
  '/',
  requireAuth,
  [
    body('title').trim().notEmpty().withMessage('Title is required'),
    body('visibility').optional().isIn(['public', 'private']).withMessage('Invalid visibility'),
  ],
  validate,
  asyncHandler(ctrl.create),
);

router.get('/:idOrSlug', optionalAuth, sheetParam, validate, asyncHandler(ctrl.get));

/* ------------------------------------------------------------ owner mutations */

router.put('/:idOrSlug', requireAuth, sheetParam, validate, asyncHandler(ctrl.update));
router.delete('/:idOrSlug', requireAuth, sheetParam, validate, asyncHandler(ctrl.remove));

/* ---------------------------------------------------------- topics / subtopics */

router.post(
  '/:idOrSlug/sections',
  requireAuth,
  [...sheetParam, body('title').trim().notEmpty().withMessage('Section title is required')],
  validate,
  asyncHandler(ctrl.addSection),
);
router.put(
  '/:idOrSlug/sections/:sectionId',
  requireAuth,
  [...sheetParam, param('sectionId').isMongoId().withMessage('Invalid section id')],
  validate,
  asyncHandler(ctrl.updateSection),
);
router.delete(
  '/:idOrSlug/sections/:sectionId',
  requireAuth,
  [...sheetParam, param('sectionId').isMongoId().withMessage('Invalid section id')],
  validate,
  asyncHandler(ctrl.deleteSection),
);
router.put(
  '/:idOrSlug/sections-order',
  requireAuth,
  [...sheetParam, body('order').isArray().withMessage('order must be an array')],
  validate,
  asyncHandler(ctrl.reorderSections),
);

/* ------------------------------------------------------------------ questions */

router.post(
  '/:idOrSlug/questions',
  requireAuth,
  sheetParam,
  validate,
  asyncHandler(ctrl.addQuestion),
);
router.put(
  '/:idOrSlug/questions/move',
  requireAuth,
  [...sheetParam, body('problemId').isMongoId().withMessage('Invalid problemId')],
  validate,
  asyncHandler(ctrl.moveQuestion),
);
router.delete(
  '/:idOrSlug/questions/:problemId',
  requireAuth,
  [...sheetParam, param('problemId').isMongoId().withMessage('Invalid problemId')],
  validate,
  asyncHandler(ctrl.removeQuestion),
);

// Bulk CSV/XLSX-exported-as-CSV import
router.post(
  '/:idOrSlug/import',
  requireAuth,
  [...sheetParam, body('csv').isString().notEmpty().withMessage('csv content is required')],
  validate,
  asyncHandler(ctrl.importQuestions),
);

// Mark done / star / tag from inside a sheet (requires following the sheet)
router.put(
  '/:idOrSlug/questions/:problemId/track',
  requireAuth,
  [...sheetParam, param('problemId').isMongoId().withMessage('Invalid problemId')],
  validate,
  asyncHandler(ctrl.trackQuestion),
);

/* --------------------------------------------------------- follow / colleagues */

router.post('/:idOrSlug/follow', requireAuth, sheetParam, validate, asyncHandler(ctrl.follow));
router.delete('/:idOrSlug/follow', requireAuth, sheetParam, validate, asyncHandler(ctrl.unfollow));

router.post(
  '/:idOrSlug/collaborators',
  requireAuth,
  [...sheetParam, body('email').isEmail().withMessage('A valid email is required')],
  validate,
  asyncHandler(ctrl.addCollaborator),
);
router.delete(
  '/:idOrSlug/collaborators/:email',
  requireAuth,
  sheetParam,
  validate,
  asyncHandler(ctrl.removeCollaborator),
);

module.exports = router;
