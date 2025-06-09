// backend/src/routes/transfer.js - Phase2 負荷分散転送版
const express = require('express');
const router = express.Router();
const db = require('../services/database');
const logger = require('../services/logger');

// 🔧 負荷分散ロジック関数
const selectBestSipAccount = (sipAccounts) => {
  // 利用可能なアカウントのみフィルタリング
  const availableAccounts = sipAccounts.filter(acc => 
    acc.current_calls < acc.max_concurrent_calls && acc.active === 1
  );
  
  if (availableAccounts.length === 0) {
    return null; // 利用可能なアカウントなし
  }
  
  // 負荷分散選択: 通話数最少 > 優先度高 > ID順
  availableAccounts.sort((a, b) => {
    // 1. 通話数最少を優先
    if (a.current_calls !== b.current_calls) {
      return a.current_calls - b.current_calls;
    }
    // 2. 優先度が高い方を優先（数値が大きい方）
    if (a.priority !== b.priority) {
      return b.priority - a.priority;
    }
    // 3. ID順（小さい方を優先）
    return a.id - b.id;
  });
  
  return availableAccounts[0];
};

// 🔄 通話数更新関数
const updateCallCount = async (sipUsername, increment = 1) => {
  try {
    await db.query(`
      UPDATE transfer_sip_assignments 
      SET current_calls = current_calls + ? 
      WHERE sip_username = ?
    `, [increment, sipUsername]);
    
    logger.info(`通話数更新: ${sipUsername} (${increment > 0 ? '+' : ''}${increment})`);
    return true;
  } catch (error) {
    logger.error(`通話数更新エラー: ${sipUsername}`, error);
    return false;
  }
};

// 転送設定取得API（Phase1互換維持）
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
    
    // Phase1との互換性のため、campaign_transfer_destinationsテーブルを確認
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

// 転送設定更新API（Phase1互換維持）
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

// 🚀 Phase2: 負荷分散動的転送処理API
router.post('/campaigns/:id/dtmf', async (req, res) => {
  try {
    const campaignId = req.params.id;
    const { callId, originalNumber, keypress } = req.body;
    
    logger.info(`🔄 Phase2 負荷分散転送開始: Campaign=${campaignId}, CallID=${callId}, Key=${keypress}`);
    
    // 必須パラメータ検証
    if (!callId || !originalNumber || !keypress || !campaignId) {
      return res.status(400).json({
        success: false,
        message: '必須パラメータが不足しています (callId, originalNumber, keypress, campaignId)'
      });
    }
    
    // Step 1: キャンペーン → 発信者番号ID取得
    const [campaigns] = await db.query(`
      SELECT c.caller_id_id, ci.number as caller_number, ci.description
      FROM campaigns c
      JOIN caller_ids ci ON c.caller_id_id = ci.id
      WHERE c.id = ? AND ci.active = 1
    `, [campaignId]);
    
    if (campaigns.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'キャンペーンまたは発信者番号が見つかりません'
      });
    }
    
    const campaign = campaigns[0];
    const callerIdId = campaign.caller_id_id;
    
    logger.info(`✅ キャンペーン情報取得: CallerID=${callerIdId} (${campaign.caller_number})`);
    
    // Step 2: 発信者番号ID + DTMFキー → 複数SIPアカウント取得
    const [sipAccounts] = await db.query(`
      SELECT id, sip_username, priority, current_calls, max_concurrent_calls, active
      FROM transfer_sip_assignments
      WHERE caller_id_id = ? AND dtmf_key = ? AND active = 1
      ORDER BY priority DESC, current_calls ASC, id ASC
    `, [callerIdId, keypress]);
    
    if (sipAccounts.length === 0) {
      logger.warn(`転送SIPアカウントなし: CallerID=${callerIdId}, Key=${keypress}`);
      return res.status(404).json({
        success: false,
        message: `発信者番号ID "${callerIdId}" のキー "${keypress}" に対応する転送SIPアカウントが見つかりません`
      });
    }
    
    logger.info(`📞 転送SIPアカウント取得: ${sipAccounts.length}個`);
    sipAccounts.forEach(acc => {
      logger.info(`  - ${acc.sip_username}: 通話数=${acc.current_calls}/${acc.max_concurrent_calls}, 優先度=${acc.priority}`);
    });
    
    // Step 3: 負荷分散選択
    const selectedSipAccount = selectBestSipAccount(sipAccounts);
    
    if (!selectedSipAccount) {
      logger.error(`利用可能なSIPアカウントなし: CallerID=${callerIdId}, Key=${keypress}`);
      return res.status(503).json({
        success: false,
        message: '現在利用可能な転送先がありません。しばらくしてからお試しください。',
        details: {
          totalAccounts: sipAccounts.length,
          availableAccounts: 0
        }
      });
    }
    
    const selectedSipUsername = selectedSipAccount.sip_username;
    
    logger.info(`🎯 負荷分散選択結果: ${selectedSipUsername} (通話数: ${selectedSipAccount.current_calls}/${selectedSipAccount.max_concurrent_calls})`);
    
    // Step 4: 通話数更新（+1）
    const updateSuccess = await updateCallCount(selectedSipUsername, 1);
    if (!updateSuccess) {
      logger.error(`通話数更新失敗: ${selectedSipUsername}`);
    }
    
    // Step 5: 転送ログ記録
    const transferLogId = `transfer-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    
    await db.query(`
      INSERT INTO transfer_logs 
      (original_call_id, campaign_id, original_number, transfer_number, keypress, transfer_initiated_at, status)
      VALUES (?, ?, ?, ?, ?, NOW(), 'initiated')
    `, [callId, campaignId, originalNumber, selectedSipUsername, keypress]);
    
    logger.info(`📝 転送ログ記録完了: CallID=${callId} → SIP=${selectedSipUsername}`);
    
    // Step 6: 実際の転送処理（今後SIPサービス連携）
    // TODO: SIPサービスとの連携実装
    // const sipService = require('../services/sipService');
    // await sipService.transferCall(callId, selectedSipUsername);
    
    // 成功レスポンス
    res.json({
      success: true,
      message: '負荷分散転送処理を開始しました',
      transfer: {
        callId: callId,
        campaignId: parseInt(campaignId),
        callerIdId: callerIdId,
        callerNumber: campaign.caller_number,
        keypress: keypress,
        selectedSip: selectedSipUsername,
        sipPriority: selectedSipAccount.priority,
        currentCalls: selectedSipAccount.current_calls + 1,
        maxCalls: selectedSipAccount.max_concurrent_calls,
        transferLogId: transferLogId,
        status: 'initiated',
        loadBalancing: {
          totalAccounts: sipAccounts.length,
          availableAccounts: sipAccounts.filter(acc => acc.current_calls < acc.max_concurrent_calls).length,
          selectedReason: `最少通話数 (${selectedSipAccount.current_calls}/${selectedSipAccount.max_concurrent_calls})`
        },
        timestamp: new Date().toISOString()
      }
    });
    
  } catch (error) {
    logger.error('Phase2 負荷分散転送エラー:', error);
    res.status(500).json({
      success: false,
      message: '転送処理中にエラーが発生しました',
      error: error.message
    });
  }
});

// 🔄 通話終了時の通話数減算API（新規追加）
router.post('/call-end', async (req, res) => {
  try {
    const { callId, sipUsername } = req.body;
    
    if (!callId || !sipUsername) {
      return res.status(400).json({
        success: false,
        message: 'callIdとsipUsernameが必要です'
      });
    }
    
    logger.info(`📞 通話終了処理: CallID=${callId}, SIP=${sipUsername}`);
    
    // 通話数減算（-1）
    const updateSuccess = await updateCallCount(sipUsername, -1);
    
    if (updateSuccess) {
      // 転送ログの状態更新
      await db.query(`
        UPDATE transfer_logs 
        SET status = 'completed', transfer_ended_at = NOW()
        WHERE original_call_id = ?
      `, [callId]);
      
      res.json({
        success: true,
        message: '通話終了処理完了',
        callId: callId,
        sipUsername: sipUsername
      });
    } else {
      res.status(500).json({
        success: false,
        message: '通話数更新に失敗しました'
      });
    }
    
  } catch (error) {
    logger.error('通話終了処理エラー:', error);
    res.status(500).json({
      success: false,
      message: '通話終了処理中にエラーが発生しました',
      error: error.message
    });
  }
});

// 📊 負荷状況取得API（新規追加）
router.get('/load-status/:callerId', async (req, res) => {
  try {
    const callerIdId = req.params.callerId;
    
    const [loadStatus] = await db.query(`
      SELECT 
        dtmf_key,
        sip_username,
        priority,
        current_calls,
        max_concurrent_calls,
        ROUND((current_calls / max_concurrent_calls) * 100, 1) as load_percentage,
        active
      FROM transfer_sip_assignments
      WHERE caller_id_id = ?
      ORDER BY dtmf_key, priority DESC
    `, [callerIdId]);
    
    // キー別サマリー
    const keySummary = {};
    loadStatus.forEach(acc => {
      if (!keySummary[acc.dtmf_key]) {
        keySummary[acc.dtmf_key] = {
          totalAccounts: 0,
          availableAccounts: 0,
          totalCapacity: 0,
          currentLoad: 0
        };
      }
      
      keySummary[acc.dtmf_key].totalAccounts++;
      keySummary[acc.dtmf_key].totalCapacity += acc.max_concurrent_calls;
      keySummary[acc.dtmf_key].currentLoad += acc.current_calls;
      
      if (acc.current_calls < acc.max_concurrent_calls && acc.active) {
        keySummary[acc.dtmf_key].availableAccounts++;
      }
    });
    
    res.json({
      success: true,
      callerIdId: parseInt(callerIdId),
      accounts: loadStatus,
      summary: keySummary,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error('負荷状況取得エラー:', error);
    res.status(500).json({
      success: false,
      message: '負荷状況の取得に失敗しました',
      error: error.message
    });
  }
});

// 転送ログ取得API（既存）
router.get('/campaigns/:id/logs', async (req, res) => {
  try {
    const campaignId = req.params.id;
    const { limit = 50, offset = 0 } = req.query;
    
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
