const express = require('express');
const rateLimit = require('express-rate-limit');
const { asyncHandler } = require('../middlewares');
const ctrl = require('../controllers/adminController');
const adminAuth = require('../middlewares/adminAuth');

const router = express.Router();

const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many admin requests. Please try again later.' },
});

// POST /api/admin/update — trigger manual data refresh
router.use(adminLimiter);
router.post('/update', adminAuth, asyncHandler(ctrl.triggerUpdate));

module.exports = router;
