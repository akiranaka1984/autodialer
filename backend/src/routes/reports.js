const express = require('express');
const router = express.Router();

const reportsController = require('../controllers/reportController');
const reportController = require('../controllers/reportController');

// レポート関連のルート
router.get('/campaigns/:id', reportsController.generateCampaignReport);
router.get('/campaigns/:id/export', reportsController.exportCampaignData);
router.get('/dashboard', reportController.getDashboardReport);

module.exports = router;