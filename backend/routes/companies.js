const express = require('express');
const { param } = require('express-validator');
const { asyncHandler, validate, optionalAuth } = require('../middlewares');
const ctrl = require('../controllers/companyController');

const router = express.Router();

// optionalAuth so a signed-in user sees their solved state inside the kit
router.get('/', asyncHandler(ctrl.list));

router.get(
  '/:slug',
  optionalAuth,
  [param('slug').trim().notEmpty().withMessage('Company slug is required')],
  validate,
  asyncHandler(ctrl.getKit),
);

module.exports = router;
