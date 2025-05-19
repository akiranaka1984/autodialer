const express = require('express');
const router = express.Router();
const callerIdController = require('../controllers/callerIdController');
const auth = require('../middleware/auth'); // 認証ミドルウェアを追加

// すべてのルートに認証を適用
router.use(auth);

// 発信者番号の基本管理ルート
// =========================

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

// CSVからの発信者番号インポート
router.post('/import', callerIdController.importCallerIds);

// 発信者番号チャンネル管理ルート
// ===========================

// 特定の発信者番号に属するチャンネル一覧を取得
router.get('/:id/channels', callerIdController.getCallerChannels);

// 特定の発信者番号にチャンネルを追加
router.post('/:id/channels', callerIdController.addCallerChannel);

// チャンネル情報を更新
router.put('/channels/:id', callerIdController.updateCallerChannel);

// チャンネルを削除
router.delete('/channels/:id', callerIdController.deleteCallerChannel);

// CSVからチャンネル一括インポート
router.post('/:id/channels/import', callerIdController.importCallerChannels);

// 特定の発信者番号のチャンネル状態サマリーを取得
router.get('/:id/channels/status', callerIdController.getCallerChannelsStatus);

// 特定のチャンネルを取得
router.get('/channels/:id', callerIdController.getCallerChannelById);

// 高度な管理機能
// ===========

// 発信者番号の状態を監視（アクティブコール数など）
router.get('/:id/monitor', callerIdController.monitorCallerId);

// 特定の発信者番号のチャンネルをリセット（すべてavailable状態に）
router.post('/:id/channels/reset', callerIdController.resetCallerChannels);

// データベースとSIPサービスのチャンネル状態を同期
router.post('/sync', callerIdController.syncCallerChannels);

module.exports = router;