const express = require('express');
const router = express.Router();
const settingsController = require('../controllers/settingsController');
const auth = require('../middleware/auth');

// 認証を必須とする
router.use(auth);

// 設定の取得
router.get('/', settingsController.getSettings);

// 設定の更新
router.put('/', settingsController.updateSettings);

module.exports = router;