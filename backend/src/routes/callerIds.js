const express = require('express');
const router = express.Router();
const callerIdController = require('../controllers/callerIdController');

// 発信者番号の取得
router.get('/', callerIdController.getAllCallerIds);
// 発信者番号の詳細取得
router.get('/:id', callerIdController.getCallerIdById);
// 発信者番号の追加
router.post('/', callerIdController.createCallerId);
// 発信者番号の更新
router.put('/:id', callerIdController.updateCallerId);
// 発信者番号の削除
router.delete('/:id', callerIdController.deleteCallerId);

// backend/src/routes/callerIds.js に追加
router.post('/import', callerIdController.importCallerIds);

module.exports = router;
