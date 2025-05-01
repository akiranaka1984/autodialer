const express = require('express');
const router = express.Router();
const callController = require('../controllers/callController');

// テスト発信API
router.post('/test', callController.testCall);

module.exports = router;
