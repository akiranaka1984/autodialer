// backend/src/routes/calls.js
const express = require('express');
const router = express.Router();
const callController = require('../controllers/callController');
const transferService = require('../services/transferService');
const db = require('../services/database');  // 追加
const logger = require('../services/logger'); // 追加

// テスト発信API
router.post('/test', callController.testCall);

// 通話履歴の取得
router.get('/', callController.getAllCalls);

// プロバイダステータスの取得
router.get('/providers/status', callController.getProvidersStatus);

// 通話終了通知
router.post('/end', callController.handleCallEnd);

// 転送関連API（統合版）
router.post('/transfer/:transferId/status', callController.getTransferStatus);
router.get('/transfers', callController.getAllTransfers);

// 🔥 動的転送API - キー押下による転送実行（実際のDB構造対応）
router.post('/transfer/keypress', async (req, res) => {
  try {
    const { customerPhone, keypress, callId, campaignId } = req.body;
    
    logger.info(`🎯 転送キー押下API呼び出し:`, {
      customerPhone,
      keypress,
      callId,
      campaignId,
      timestamp: new Date().toISOString()
    });
    
    // 必須パラメータ検証
    if (!customerPhone) {
      return res.status(400).json({
        success: false,
        message: 'お客様の電話番号が必要です',
        code: 'MISSING_CUSTOMER_PHONE'
      });
    }
    
    if (!keypress) {
      return res.status(400).json({
        success: false,
        message: 'キー押下情報が必要です',
        code: 'MISSING_KEYPRESS'
      });
    }
    
    // 1キー以外は現在未対応
    if (keypress !== '1') {
      logger.info(`⚠️ 未対応キー押下: ${keypress} (現在は1キーのみ対応)`);
      
      // DNCリスト登録（9キーの場合）
      if (keypress === '9') {
        try {
          // 実際のテーブル構造に基づくDNC登録
          const [dncTables] = await db.query(`SHOW TABLES LIKE 'dnc_list'`);
          
          if (dncTables.length > 0) {
            await db.query(
              'INSERT IGNORE INTO dnc_list (phone, reason, source) VALUES (?, ?, ?)',
              [customerPhone, 'ユーザーリクエスト（9キー）', 'customer_request']
            );
          } else {
            logger.warn('dnc_list テーブルが存在しません');
          }
          
          return res.json({
            success: true,
            message: 'DNCリストに登録しました',
            action: 'dnc_registered',
            keypress
          });
        } catch (dncError) {
          logger.error('DNC登録エラー:', dncError);
        }
      }
      
      return res.json({
        success: true,
        message: `${keypress}キーを受け付けました`,
        action: 'key_received',
        keypress
      });
    }
    
    // 🚀 動的転送実行
    logger.info(`📞 動的転送開始: ${customerPhone} → 自動選択チャンネル`);
    
    const transferResult = await transferService.handleTransferKeypress(
      customerPhone,
      keypress,
      callId
    );
    
    if (transferResult.success) {
      // 成功ログ
      logger.info(`✅ 動的転送成功:`, {
        customerPhone,
        transferTarget: transferResult.target?.username,
        transferId: transferResult.transferId,
        message: transferResult.message
      });
      
      // 通話ログ更新（転送情報記録）- 実際のテーブル構造確認
      if (callId) {
        try {
          // まず call_logs テーブルに transfer 関連カラムがあるか確認
          const [columns] = await db.query(`
            SHOW COLUMNS FROM call_logs LIKE 'transfer_%'
          `);
          
          if (columns.length > 0) {
            // transfer カラムが存在する場合
            await db.query(`
              UPDATE call_logs 
              SET transfer_attempted = 1, 
                  transfer_successful = 1,
                  transfer_target = ?,
                  keypress = ?
              WHERE call_id = ?
            `, [transferResult.target?.username, keypress, callId]);
          } else {
            // transfer カラムが存在しない場合は基本情報のみ更新
            await db.query(`
              UPDATE call_logs 
              SET keypress = ?, status = 'TRANSFERRED'
              WHERE call_id = ?
            `, [keypress, callId]);
          }
          
          logger.info(`📝 通話ログ更新完了: ${callId}`);
        } catch (updateError) {
          logger.error('通話ログ更新エラー:', updateError);
        }
      }
      
      res.json({
        success: true,
        message: transferResult.message,
        data: {
          transferId: transferResult.transferId,
          transferTarget: {
            username: transferResult.target?.username,
            callerNumber: transferResult.target?.caller_number,
            domain: transferResult.target?.domain
          },
          customerPhone,
          keypress,
          transferTime: new Date().toISOString(),
          method: 'dynamic_internal_transfer'
        }
      });
      
    } else {
      // 転送失敗
      logger.error(`❌ 動的転送失敗:`, {
        customerPhone,
        error: transferResult.error,
        message: transferResult.message
      });
      
      // 失敗ログ記録
      if (callId) {
        try {
          const [columns] = await db.query(`
            SHOW COLUMNS FROM call_logs LIKE 'transfer_%'
          `);
          
          if (columns.length > 0) {
            await db.query(`
              UPDATE call_logs 
              SET transfer_attempted = 1, 
                  transfer_successful = 0,
                  keypress = ?
              WHERE call_id = ?
            `, [keypress, callId]);
          } else {
            await db.query(`
              UPDATE call_logs 
              SET keypress = ?
              WHERE call_id = ?
            `, [keypress, callId]);
          }
        } catch (updateError) {
          logger.error('失敗ログ更新エラー:', updateError);
        }
      }
      
      res.status(500).json({
        success: false,
        message: transferResult.message || '転送処理に失敗しました',
        error: transferResult.error,
        data: {
          customerPhone,
          keypress,
          failureTime: new Date().toISOString(),
          method: 'dynamic_internal_transfer'
        }
      });
    }
    
  } catch (error) {
    logger.error(`🔥 転送API全体エラー:`, error);
    
    res.status(500).json({
      success: false,
      message: '転送システムでエラーが発生しました',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// 🔍 転送状況確認API
router.get('/transfer/status/:callId', async (req, res) => {
  try {
    const { callId } = req.params;
    
    // transfer_logs テーブルが存在するかチェック
    const [tables] = await db.query(`SHOW TABLES LIKE 'transfer_logs'`);
    
    if (tables.length === 0) {
      return res.status(404).json({
        success: false,
        message: '転送ログテーブルが存在しません',
        callId
      });
    }
    
    // 転送ログから状況を取得
    const [transferLogs] = await db.query(`
      SELECT tl.*, cl.phone_number, cl.status as call_status
      FROM transfer_logs tl
      LEFT JOIN call_logs cl ON tl.call_id = cl.call_id
      WHERE tl.call_id = ?
      ORDER BY tl.created_at DESC
    `, [callId]);
    
    if (transferLogs.length === 0) {
      return res.status(404).json({
        success: false,
        message: '転送記録が見つかりません',
        callId
      });
    }
    
    const transferLog = transferLogs[0];
    
    res.json({
      success: true,
      data: {
        callId,
        transferId: transferLog.id,
        transferStatus: transferLog.transfer_status,
        transferTarget: transferLog.transfer_target,
        customerPhone: transferLog.phone_number,
        transferStartTime: transferLog.transfer_start_time,
        transferAnswerTime: transferLog.transfer_answer_time,
        transferEndTime: transferLog.transfer_end_time,
        duration: transferLog.transfer_duration,
        errorMessage: transferLog.error_message
      }
    });
    
  } catch (error) {
    logger.error('転送状況確認エラー:', error);
    res.status(500).json({
      success: false,
      message: '転送状況の確認に失敗しました',
      error: error.message
    });
  }
});

// 📊 転送統計API
router.get('/transfer/statistics', async (req, res) => {
  try {
    const { campaignId } = req.query;
    
    const stats = await transferService.getTransferStatistics(campaignId);
    
    res.json({
      success: true,
      data: stats,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error('転送統計取得エラー:', error);
    res.status(500).json({
      success: false,
      message: '転送統計の取得に失敗しました',
      error: error.message
    });
  }
});

module.exports = router;
