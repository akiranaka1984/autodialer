// backend/src/routes/operators.js
const express = require('express');
const router = express.Router();
const operatorController = require('../controllers/operatorController');


// 認証が必要なルート


// オペレーター一覧を取得
router.get('/', operatorController.getAllOperators);

// オペレーターの詳細情報を取得
router.get('/:id', operatorController.getOperatorById);

// オペレーターの統計情報を取得
router.get('/:id/stats', operatorController.getOperatorStats);

// オペレーターの状態を更新
router.put('/:id/status', operatorController.updateOperatorStatus);

// オペレーターを新規作成（管理者のみ）
router.post('/', operatorController.createOperator);

// オペレーターを削除（管理者のみ）
router.delete('/:id', operatorController.deleteOperator);

// オペレーターの通話操作
router.post('/call/:action', operatorController.handleCallAction);

// オペレーターの割り当て
router.post('/assign', operatorController.assignOperator);

module.exports = router;