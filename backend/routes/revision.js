const express = require('express');
const { body, param } = require('express-validator');
const { asyncHandler, validate, requireAuth } = require('../middlewares');
const { RATINGS } = require('../utils/spacedRepetition');
const ctrl = require('../controllers/revisionController');

const router = express.Router();

router.use(requireAuth);

router.get('/queue', asyncHandler(ctrl.queue));
router.get('/stats', asyncHandler(ctrl.stats));
router.get('/due', asyncHandler(ctrl.due));
router.get('/recent', asyncHandler(ctrl.recent));

// Rate a revision: reschedules the question and advances the streak
router.post(
  '/:id/rate',
  [
    param('id').isMongoId().withMessage('Invalid question id'),
    body('rating').isIn(RATINGS).withMessage(`rating must be one of: ${RATINGS.join(', ')}`),
  ],
  validate,
  asyncHandler(ctrl.rate),
);

module.exports = router;
