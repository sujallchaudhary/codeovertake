const express = require('express');
const { body, param } = require('express-validator');
const { asyncHandler, validate, requireAuth } = require('../middlewares');
const ctrl = require('../controllers/workspaceController');

const router = express.Router();

// The whole workspace is private
router.use(requireAuth);

// Literal paths before /:id
router.get('/', asyncHandler(ctrl.list));
router.get('/stats', asyncHandler(ctrl.stats));
router.get('/tags', asyncHandler(ctrl.tags));

router.post(
  '/',
  [
    body('url').optional({ values: 'falsy' }).trim(),
    body('problemId').optional({ values: 'falsy' }).isMongoId().withMessage('Invalid problemId'),
    body('tags').optional().isArray().withMessage('tags must be an array'),
  ],
  validate,
  asyncHandler(ctrl.add),
);

const idValidator = [param('id').isMongoId().withMessage('Invalid question id')];

router.get('/:id', idValidator, validate, asyncHandler(ctrl.get));
router.put('/:id', idValidator, validate, asyncHandler(ctrl.update));
router.put(
  '/:id/status',
  [
    ...idValidator,
    body('status').isIn(['solved', 'unsolved']).withMessage('status must be solved or unsolved'),
  ],
  validate,
  asyncHandler(ctrl.setStatus),
);
router.delete('/:id', idValidator, validate, asyncHandler(ctrl.remove));

module.exports = router;
