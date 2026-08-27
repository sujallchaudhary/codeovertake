const express = require('express');
const { body, param } = require('express-validator');
const { asyncHandler, validate, requireAuth } = require('../middlewares');
const ctrl = require('../controllers/noteController');

const router = express.Router();

router.use(requireAuth);

router.get('/', asyncHandler(ctrl.list));
router.get('/tags', asyncHandler(ctrl.tags));

router.get(
  '/for-problem/:problemId',
  [param('problemId').isMongoId().withMessage('Invalid problem id')],
  validate,
  asyncHandler(ctrl.forProblem),
);

router.post(
  '/',
  [
    body('title').trim().notEmpty().withMessage('Title is required'),
    body('linkedProblems').optional().isArray().withMessage('linkedProblems must be an array'),
    body('tags').optional().isArray().withMessage('tags must be an array'),
  ],
  validate,
  asyncHandler(ctrl.create),
);

const idValidator = [param('id').isMongoId().withMessage('Invalid note id')];

router.get('/:id', idValidator, validate, asyncHandler(ctrl.get));
router.put('/:id', idValidator, validate, asyncHandler(ctrl.update));
router.delete('/:id', idValidator, validate, asyncHandler(ctrl.remove));

// Link/unlink a single question ("write once, see everywhere")
router.post(
  '/:id/links',
  [...idValidator, body('problem').trim().notEmpty().withMessage('problem id or URL is required')],
  validate,
  asyncHandler(ctrl.link),
);
router.delete(
  '/:id/links/:problemId',
  [...idValidator, param('problemId').isMongoId().withMessage('Invalid problem id')],
  validate,
  asyncHandler(ctrl.unlink),
);

module.exports = router;
