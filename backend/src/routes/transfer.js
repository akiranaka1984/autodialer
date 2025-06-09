// backend/src/routes/transfer.js - カラム名修正版
const express = require('express');
const router = express.Router();
const db = require('../services/database');
const logger = require('../services/logger');

// 転送設定取得API
router.get('/campaigns/:id/transfer-settings', async (req, res) => {
  try {
    const campaignId = req.params.id;
    
    // キャンペーン存在確認
    const [campaigns] = await db.query(
      'SELECT id FROM campaigns WHERE id = ?',
      [campaignId]
    );
    
    if (campaigns.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'キャンペーンが見つかりません'
      });
    }
    
    // 転送設定取得
    const [settings] = await db.query(
      'SELECT dtmf_key, sip_username, active, created_at, updated_at FROM campaign_transfer_destinations WHERE campaign_id = ? ORDER BY dtmf_key',
      [campaignId]
    );
    
    logger.info(`転送設定取得: Campaign=${campaignId}, 設定数=${settings.length}`);
    
    res.json({
      success: true,
      campaignId: parseInt(campaignId),
      settings: settings
    });
    
  } catch (error) {
    logger.error('転送設定取得エラー:', error);
    res.status(500).json({
      success: false,
      message: '転送設定の取得に失敗しました',
      error: error.message
    });
  }
});

// 転送設定更新API
router.post('/campaigns/:id/transfer-settings', async (req, res) => {
  try {
    const campaignId = req.params.id;
    const { settings } = req.body;
    
    if (!Array.isArray(settings)) {
      return res.status(400).json({
        success: false,
        message: 'settings配列が必要です'
      });
    }
    
    logger.info(`転送設定更新開始: Campaign=${campaignId}, 設定数=${settings.length}`);
    
    // トランザクション開始
    await db.query('START TRANSACTION');
    
    try {
      // 既存設定削除
      await db.query(
        'DELETE FROM campaign_transfer_destinations WHERE campaign_id = ?',
        [campaignId]
      );
      
      let insertCount = 0;
      
      // 新しい設定を挿入
      for (const setting of settings) {
        const { dtmf_key, sip_username, active = true } = setting;
        
        if (!dtmf_key || !sip_username) {
          logger.warn(`無効な設定をスキップ: ${JSON.stringify(setting)}`);
          continue;
        }
        
        await db.query(
          'INSERT INTO campaign_transfer_destinations (campaign_id, dtmf_key, sip_username, active) VALUES (?, ?, ?, ?)',
          [campaignId, dtmf_key, sip_username, active ? 1 : 0]
        );
        
        insertCount++;
        logger.info(`転送設定追加: Campaign=${campaignId}, Key=${dtmf_key}, SIP=${sip_username}`);
      }
      
      await db.query('COMMIT');
      
      res.json({
        success: true,
        campaignId: parseInt(campaignId),
        message: `転送設定を更新しました`,
        updatedCount: insertCount
      });
      
    } catch (transactionError) {
      await db.query('ROLLBACK');
      throw transactionError;
    }
    
  } catch (error) {
    logger.error('転送設定更新エラー:', error);
    res.status(500).json({
      success: false,
      message: '転送設定の更新に失敗しました',
      error: error.message
    });
  }
});

// 🔥 修正版: 動的転送処理API (カラム名修正)
router.post('/campaigns/:id/dtmf', async (req, res) => {
  try {
    const campaignId = req.params.id;
    const { callId, originalNumber, keypress } = req.body;
    
    logger.info(`🔄 動的転送処理開始: Campaign=${campaignId}, CallID=${callId}, Key=${keypress}`);
    
    // 必須パラメータ検証
    if (!callId || !originalNumber || !keypress || !campaignId) {
      return res.status(400).json({
        success: false,
        message: '必須パラメータが不足しています (callId, originalNumber, keypress, campaignId)'
      });
    }
    
    // 転送設定取得
    const [transferSettings] = await db.query(`
      SELECT sip_username, active
      FROM campaign_transfer_destinations 
      WHERE campaign_id = ? AND dtmf_key = ? AND active = 1
    `, [campaignId, keypress]);
    
    if (transferSettings.length === 0) {
      logger.warn(`転送設定なし: Campaign=${campaignId}, Key=${keypress}`);
      return res.status(404).json({
        success: false,
        message: `キー "${keypress}" に対応する転送設定が見つかりません`
      });
    }
    
    const transferSetting = transferSettings[0];
    const sipUsername = transferSetting.sip_username;
    
    logger.info(`✅ 転送設定発見: Key=${keypress} → SIP=${sipUsername}`);
    
    // 🔥 修正: カラム名をDBスキーマに合わせる
    const transferLogId = `transfer-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    
    // 転送ログ記録 (修正版: original_call_id使用)
    await db.query(`
      INSERT INTO transfer_logs 
      (original_call_id, campaign_id, original_number, transfer_number, keypress, transfer_initiated_at, status)
      VALUES (?, ?, ?, ?, ?, NOW(), 'initiated')
    `, [callId, campaignId, originalNumber, sipUsername, keypress]);
    
    logger.info(`📝 転送ログ記録完了: CallID=${callId} → SIP=${sipUsername}`);
    
    // 実際の転送処理 (今後実装)
    // TODO: SIPサービスとの連携
    // const sipService = require('../services/sipService');
    // await sipService.transferCall(callId, sipUsername);
    
    // 成功レスポンス
    res.json({
      success: true,
      message: '転送処理を開始しました',
      transfer: {
        callId: callId,
        campaignId: parseInt(campaignId),
        keypress: keypress,
        targetSip: sipUsername,
        transferLogId: transferLogId,
        status: 'initiated',
        timestamp: new Date().toISOString()
      }
    });
    
  } catch (error) {
    logger.error('動的転送処理エラー:', error);
    res.status(500).json({
      success: false,
      message: '転送処理中にエラーが発生しました',
      error: error.message
    });
  }
});

// 転送ログ取得API
router.get('/campaigns/:id/logs', async (req, res) => {
  try {
    const campaignId = req.params.id;
    const { limit = 50, offset = 0 } = req.query;
    
    // 🔥 修正: カラム名をDBスキーマに合わせる
    const [logs] = await db.query(`
      SELECT 
        original_call_id as call_id,
        campaign_id,
        original_number,
        transfer_number,
        keypress,
        transfer_initiated_at,
        transfer_connected_at,
        transfer_ended_at,
        status,
        duration,
        failure_reason,
        created_at
      FROM transfer_logs 
      WHERE campaign_id = ?
      ORDER BY transfer_initiated_at DESC
      LIMIT ? OFFSET ?
    `, [campaignId, parseInt(limit), parseInt(offset)]);
    
    res.json({
      success: true,
      campaignId: parseInt(campaignId),
      logs: logs,
      total: logs.length
    });
    
  } catch (error) {
    logger.error('転送ログ取得エラー:', error);
    res.status(500).json({
      success: false,
      message: '転送ログの取得に失敗しました',
      error: error.message
    });
  }
});

module.exports = router;
