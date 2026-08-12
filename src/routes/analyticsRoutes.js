const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { getDashboardStats, getCampaignAnalytics } = require('../controllers/analyticsController');

router.get('/dashboard', authenticate, getDashboardStats);
router.get('/campaign/:id', authenticate, getCampaignAnalytics);

module.exports = router;
