const express = require('express');
const router = express.Router();
const { trackOpen, trackClick } = require('../controllers/trackingController');

router.get('/track/open/:id', trackOpen);
router.get('/track/click/:code', trackClick);

module.exports = router;
