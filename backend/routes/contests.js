const express = require('express');
const { param } = require('express-validator');
const { asyncHandler, validate } = require('../middlewares');
const adminAuth = require('../middlewares/adminAuth');
const ctrl = require('../controllers/contestController');

const router = express.Router();

// Literal paths first so they are not swallowed by /:id
router.get('/', asyncHandler(ctrl.getContests));
router.get('/upcoming', asyncHandler(ctrl.getUpcoming));
router.get('/calendar', asyncHandler(ctrl.getCalendar));

// Manual re-sync (admin only; the cron handles the routine case)
router.post('/sync', adminAuth, asyncHandler(ctrl.sync));

router.get(
  '/:id',
  [param('id').isMongoId().withMessage('Invalid contest id')],
  validate,
  asyncHandler(ctrl.getContest),
);

module.exports = router;
