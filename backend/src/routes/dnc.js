const express = require('express');
const router = express.Router();
const dncController = require('../controllers/dncController');
const auth = require('../middleware/auth');

// 認証ミドルウェアを適用
router.use(auth);

// DNCリストの取得
router.get('/', dncController.getDNCList);

// DNCリストに追加
router.post('/', dncController.addToDNC);

// DNCリストから削除
router.delete('/:id', dncController.removeFromDNC);

// DNCリストのインポート
router.post('/import', dncController.importDNC);

// DNCリストのエクスポート
router.get('/export', dncController.exportDNC);

module.exports = router;