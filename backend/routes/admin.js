const express = require('express');
const { asyncHandler } = require('../middlewares');
const ctrl = require('../controllers/adminController');
const adminAuth = require('../middlewares/adminAuth');

const router = express.Router();

// POST /api/admin/update — trigger manual data refresh
router.post('/update', adminAuth, asyncHandler(ctrl.triggerUpdate));

module.exports = router;
