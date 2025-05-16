// src/routes/calls.js
const express = require('express');
const router = express.Router();
const callController = require('../controllers/callController');
const auth = require('../middleware/auth');

// テスト発信API
router.post('/test', auth, callController.testCall);

// 通話履歴の取得
router.get('/', auth, callController.getAllCalls);

// プロバイダステータスの取得
router.get('/providers/status', auth, callController.getProvidersStatus);

// 通話終了通知
router.post('/end', callController.handleCallEnd);

module.exports = router;