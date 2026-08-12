const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const {
  getCampaigns,
  getCampaign,
  createCampaign,
  updateCampaign,
  deleteCampaign,
  sendCampaign
} = require('../controllers/campaignController');

router.get('/', authenticate, getCampaigns);
router.get('/:id', authenticate, getCampaign);
router.post('/', authenticate, createCampaign);
router.put('/:id', authenticate, updateCampaign);
router.delete('/:id', authenticate, deleteCampaign);
router.post('/:id/send', authenticate, sendCampaign);

module.exports = router;
