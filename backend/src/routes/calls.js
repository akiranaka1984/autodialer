// backend/src/routes/calls.js
const express = require('express');
const router = express.Router();
const callController = require('../controllers/callController');


// テスト発信API
router.post('/test', callController.testCall);

// 通話履歴の取得
router.get('/', callController.getAllCalls);

// プロバイダステータスの取得
router.get('/providers/status', callController.getProvidersStatus);

// 通話終了通知
router.post('/end', callController.handleCallEnd);


// 転送要求エンドポイント（1キー押下時）
router.post('/transfer/keypress', callController.handleTransferRequest);

router.post('/transfer/:transferId/status', callController.getTransferStatus);
router.get('/transfers', callController.getAllTransfers);


module.exports = router;
