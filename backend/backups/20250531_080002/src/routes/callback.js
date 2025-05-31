// backend/src/routes/callback.js
const express = require('express');
const router = express.Router();
const callbackController = require('../controllers/callbackController');

// 通話開始時のコールバック
router.post('/call-start', callbackController.handleCallStart);

// キーパッド入力時のコールバック
router.post('/keypress', callbackController.handleKeypress);

// 通話終了時のコールバック
router.post('/call-end', callbackController.handleCallEnd);

// 通話統計API（認証が必要）
router.get('/stats', callbackController.getCallStats);

module.exports = router;