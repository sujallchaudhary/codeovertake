const express = require('express');
const { body, param, query } = require('express-validator');
const { asyncHandler, validate, optionalAuth } = require('../middlewares');
const ctrl = require('../controllers/problemController');

const router = express.Router();

// Literal paths before /:id
router.get(
  '/search',
  [
    query('q').optional({ values: 'falsy' }).trim(),
    query('platform').optional({ values: 'falsy' }).trim(),
    query('difficulty').optional({ values: 'falsy' }).trim(),
    query('topic').optional({ values: 'falsy' }).trim(),
  ],
  validate,
  asyncHandler(ctrl.search),
);

router.get('/topics', asyncHandler(ctrl.topics));
router.get('/platforms', asyncHandler(ctrl.platforms));

// Paste-a-URL resolution. Open to anonymous callers so the "add question"
// preview card can render before the user commits to saving it.
router.post(
  '/resolve',
  optionalAuth,
  [body('url').trim().notEmpty().withMessage('url is required')],
  validate,
  asyncHandler(ctrl.resolve),
);

router.get(
  '/:id',
  [param('id').isMongoId().withMessage('Invalid problem id')],
  validate,
  asyncHandler(ctrl.getProblem),
);

module.exports = router;
