const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const reportsController = require('../controllers/reportsController');

// レポート関連のルート
router.get('/campaigns/:id', auth, reportsController.generateCampaignReport);
router.get('/campaigns/:id/export', auth, reportsController.exportCampaignData);

module.exports = router;