// backend/src/routes/transfer.js - Phase2.2 完全版（通話数リセット機能統合）
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

// ================================
// 🚀 Phase2.2: 通話数リセット機能
// ================================

// 🔄 特定発信者番号の通話数リセット（緊急対応用）
router.post('/reset-call-counts/:callerId', async (req, res) => {
  try {
    const callerIdId = req.params.callerId;
    
    logger.info(`🔄 通話数リセット要求: CallerID=${callerIdId}`);
    
    // 発信者番号存在確認
    const [callerIds] = await db.query(
      'SELECT id, number FROM caller_ids WHERE id = ?',
      [callerIdId]
    );
    
    if (callerIds.length === 0) {
      return res.status(404).json({
        success: false,
        message: '発信者番号が見つかりません'
      });
    }
    
    // リセット前の状況確認
    const [beforeStatus] = await db.query(`
      SELECT 
        dtmf_key,
        COUNT(*) as sip_count,
        SUM(current_calls) as total_calls,
        SUM(max_concurrent_calls) as total_capacity
      FROM transfer_sip_assignments 
      WHERE caller_id_id = ?
      GROUP BY dtmf_key
    `, [callerIdId]);
    
    // 通話数を全てリセット
    const [resetResult] = await db.query(`
      UPDATE transfer_sip_assignments 
      SET current_calls = 0, updated_at = NOW()
      WHERE caller_id_id = ?
    `, [callerIdId]);
    
    // リセット後の状況確認
    const [afterStatus] = await db.query(`
      SELECT 
        dtmf_key,
        sip_username,
        current_calls,
        max_concurrent_calls
      FROM transfer_sip_assignments 
      WHERE caller_id_id = ?
      ORDER BY dtmf_key, sip_username
    `, [callerIdId]);
    
    const totalResetCalls = beforeStatus.reduce((sum, row) => sum + (row.total_calls || 0), 0);
    
    logger.info(`✅ 通話数リセット完了: CallerID=${callerIdId}, 影響SIP=${resetResult.affectedRows}個, リセット通話数=${totalResetCalls}`);
    
    res.json({
      success: true,
      message: `${resetResult.affectedRows}個のSIPアカウントの通話数をリセットしました`,
      data: {
        callerIdId: parseInt(callerIdId),
        callerNumber: callerIds[0].number,
        resetCount: resetResult.affectedRows,
        totalCallsReset: totalResetCalls,
        beforeStatus: beforeStatus,
        afterStatus: afterStatus,
        timestamp: new Date().toISOString()
      }
    });
    
  } catch (error) {
    logger.error('通話数リセットエラー:', error);
    res.status(500).json({
      success: false,
      message: '通話数のリセットに失敗しました',
      error: error.message
    });
  }
});

// 🚨 全体システム通話数リセット（緊急時用）
router.post('/reset-all-call-counts', async (req, res) => {
  try {
    logger.info('🚨 全体システム通話数リセット要求');
    
    // リセット前の全体状況
    const [beforeGlobalStatus] = await db.query(`
      SELECT 
        caller_id_id,
        COUNT(*) as sip_count,
        SUM(current_calls) as total_calls
      FROM transfer_sip_assignments 
      WHERE current_calls > 0
      GROUP BY caller_id_id
    `);
    
    // 全体リセット実行
    const [globalResetResult] = await db.query(`
      UPDATE transfer_sip_assignments 
      SET current_calls = 0, updated_at = NOW()
      WHERE current_calls > 0
    `);
    
    const totalCallsReset = beforeGlobalStatus.reduce((sum, row) => sum + (row.total_calls || 0), 0);
    
    logger.info(`✅ 全体通話数リセット完了: 影響SIP=${globalResetResult.affectedRows}個, 総リセット通話数=${totalCallsReset}`);
    
    res.json({
      success: true,
      message: `システム全体で${globalResetResult.affectedRows}個のSIPアカウントの通話数をリセットしました`,
      data: {
        globalResetCount: globalResetResult.affectedRows,
        totalCallsReset: totalCallsReset,
        affectedCallerIds: beforeGlobalStatus.map(row => row.caller_id_id),
        timestamp: new Date().toISOString()
      }
    });
    
  } catch (error) {
    logger.error('全体通話数リセットエラー:', error);
    res.status(500).json({
      success: false,
      message: '全体通話数のリセットに失敗しました',
      error: error.message
    });
  }
});

// 🔍 通話数状況診断API
router.get('/call-counts-diagnosis/:callerId', async (req, res) => {
  try {
    const callerIdId = req.params.callerId;
    
    const [diagnosis] = await db.query(`
      SELECT 
        dtmf_key,
        sip_username,
        current_calls,
        max_concurrent_calls,
        CASE 
          WHEN current_calls > max_concurrent_calls THEN 'OVERFLOW'
          WHEN current_calls > 0 THEN 'BUSY'
          ELSE 'AVAILABLE'
        END as status,
        updated_at
      FROM transfer_sip_assignments 
      WHERE caller_id_id = ?
      ORDER BY dtmf_key, current_calls DESC
    `, [callerIdId]);
    
    const summary = {
      totalSipAccounts: diagnosis.length,
      busyAccounts: diagnosis.filter(d => d.current_calls > 0).length,
      overflowAccounts: diagnosis.filter(d => d.current_calls > d.max_concurrent_calls).length,
      totalActiveCalls: diagnosis.reduce((sum, d) => sum + d.current_calls, 0),
      needsReset: diagnosis.some(d => d.current_calls > 0)
    };
    
    res.json({
      success: true,
      callerIdId: parseInt(callerIdId),
      summary: summary,
      details: diagnosis
    });
    
  } catch (error) {
    logger.error('通話数診断エラー:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 🎯 根本解決: 通話終了時自動減算API
router.post('/call-ended', async (req, res) => {
  try {
    const { callId, originalNumber, transferTarget, campaignId } = req.body;
    
    logger.info(`📞 通話終了通知受信: CallID=${callId}, 転送先=${transferTarget}`);
    
    if (!transferTarget) {
      // 転送が発生していない場合はスキップ
      return res.json({
        success: true,
        message: '転送なし - 処理不要',
        action: 'skipped'
      });
    }
    
    // 転送先SIPアカウントの通話数を減算
    const [decrementResult] = await db.query(`
      UPDATE transfer_sip_assignments 
      SET current_calls = GREATEST(current_calls - 1, 0),
          updated_at = NOW()
      WHERE sip_username = ? AND current_calls > 0
    `, [transferTarget]);
    
    if (decrementResult.affectedRows > 0) {
      logger.info(`✅ 通話数自動減算: SIP=${transferTarget}, 減算後通話数確認中...`);
      
      // 減算後の状況確認
      const [afterDecrement] = await db.query(`
        SELECT current_calls, max_concurrent_calls
        FROM transfer_sip_assignments 
        WHERE sip_username = ?
      `, [transferTarget]);
      
      if (afterDecrement.length > 0) {
        const currentCalls = afterDecrement[0].current_calls;
        const maxCalls = afterDecrement[0].max_concurrent_calls;
        
        logger.info(`📊 ${transferTarget}: ${currentCalls}/${maxCalls} 通話中`);
        
        res.json({
          success: true,
          message: `${transferTarget}の通話数を自動減算しました`,
          data: {
            sipUsername: transferTarget,
            currentCalls: currentCalls,
            maxConcurrentCalls: maxCalls,
            decrementedRows: decrementResult.affectedRows
          }
        });
      } else {
        res.json({
          success: true,
          message: 'SIPアカウントが見つかりませんでした'
        });
      }
      
    } else {
      logger.warn(`⚠️ 通話数減算対象なし: SIP=${transferTarget}`);
      
      res.json({
        success: true,
        message: '減算対象の通話数がありませんでした',
        data: {
          sipUsername: transferTarget,
          decrementedRows: 0
        }
      });
    }
    
  } catch (error) {
    logger.error('通話終了時減算エラー:', error);
    res.status(500).json({
      success: false,
      message: '通話数の自動減算に失敗しました',
      error: error.message
    });
  }
});

// 🔄 複数SIP一括減算API（複数転送対応）
router.post('/bulk-call-ended', async (req, res) => {
  try {
    const { callId, transferTargets } = req.body; // transferTargets: ['03750001', '03750002']
    
    if (!Array.isArray(transferTargets) || transferTargets.length === 0) {
      return res.status(400).json({
        success: false,
        message: '転送先SIPアカウントの配列が必要です'
      });
    }
    
    logger.info(`📞 複数通話終了処理: CallID=${callId}, 対象SIP=${transferTargets.length}個`);
    
    const decrementResults = [];
    
    // 各SIPアカウントの通話数を減算
    for (const sipUsername of transferTargets) {
      try {
        const [decrementResult] = await db.query(`
          UPDATE transfer_sip_assignments 
          SET current_calls = GREATEST(current_calls - 1, 0),
              updated_at = NOW()
          WHERE sip_username = ? AND current_calls > 0
        `, [sipUsername]);
        
        decrementResults.push({
          sipUsername,
          success: true,
          affectedRows: decrementResult.affectedRows
        });
        
        if (decrementResult.affectedRows > 0) {
          logger.info(`✅ 通話数減算完了: ${sipUsername}`);
        } else {
          logger.warn(`⚠️ 減算対象なし: ${sipUsername}`);
        }
        
      } catch (sipError) {
        logger.error(`❌ SIP減算エラー: ${sipUsername}`, sipError);
        decrementResults.push({
          sipUsername,
          success: false,
          error: sipError.message
        });
      }
    }
    
    const successCount = decrementResults.filter(r => r.success).length;
    const totalDecremented = decrementResults.reduce((sum, r) => sum + (r.affectedRows || 0), 0);
    
    res.json({
      success: true,
      message: `${successCount}/${transferTargets.length}個のSIPアカウントの通話数を処理しました`,
      data: {
        callId,
        totalProcessed: transferTargets.length,
        successCount,
        totalDecremented,
        results: decrementResults
      }
    });
    
  } catch (error) {
    logger.error('一括通話終了処理エラー:', error);
    res.status(500).json({
      success: false,
      message: '一括通話数減算に失敗しました',
      error: error.message
    });
  }
});

// ================================
// Phase1互換 基本転送API
// ================================

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

// ================================
// 🚀 Phase2: 負荷分散転送処理API
// ================================

// 負荷分散動的転送処理API
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

// 🔄 既存の通話終了API（互換性維持）
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

// 📊 負荷状況取得API（既存）
router.get('/load-status/:callerId', async (req, res) => {
  try {
    const callerIdId = req.params.callerId;
    
    const [loadStatus] = await db.query(`
      SELECT
        id,
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

// ================================
// 🚀 Phase2: SIP管理API
// ================================

// SIP追加API
router.post('/sip-accounts', async (req, res) => {
  try {
    const { caller_id_id, dtmf_key, sip_username, sip_password, priority } = req.body;
    
    logger.info(`🔧 SIP追加要求: CallerID=${caller_id_id}, Key=${dtmf_key}, SIP=${sip_username}`);
    
    // 🔍 バリデーション
    if (!caller_id_id || !dtmf_key || !sip_username) {
      return res.status(400).json({
        success: false,
        message: '必須パラメータが不足しています (caller_id_id, dtmf_key, sip_username)'
      });
    }
    
    // DTMFキー制限チェック
    if (!['1', '2', '3'].includes(dtmf_key)) {
      return res.status(400).json({
        success: false,
        message: 'DTMFキーは1, 2, 3のみ有効です'
      });
    }
    
    // 🔍 重複チェック
    const [existing] = await db.query(
      'SELECT id FROM transfer_sip_assignments WHERE dtmf_key = ? AND sip_username = ?',
      [dtmf_key, sip_username]
    );
    
    if (existing.length > 0) {
      return res.status(409).json({
        success: false,
        message: `キー "${dtmf_key}" に SIP "${sip_username}" は既に登録済みです`
      });
    }
    
    // 🔍 優先度自動設定（最大優先度+1）
    const [maxPriority] = await db.query(
      'SELECT COALESCE(MAX(priority), 0) as max_priority FROM transfer_sip_assignments WHERE caller_id_id = ? AND dtmf_key = ?',
      [caller_id_id, dtmf_key]
    );
    
    const newPriority = priority || (maxPriority[0].max_priority + 1);
    
    // 🚀 データベース挿入
    const [result] = await db.query(`
      INSERT INTO transfer_sip_assignments 
      (caller_id_id, dtmf_key, sip_username, sip_password, priority, max_concurrent_calls, current_calls, active)
      VALUES (?, ?, ?, ?, ?, 5, 0, 1)
    `, [caller_id_id, dtmf_key, sip_username, sip_password || '', newPriority]);
    
    logger.info(`✅ SIP追加成功: ID=${result.insertId}, SIP=${sip_username}, Priority=${newPriority}`);
    
    res.json({
      success: true,
      message: 'SIPアカウントを追加しました',
      data: {
        id: result.insertId,
        caller_id_id: parseInt(caller_id_id),
        dtmf_key: dtmf_key,
        sip_username: sip_username,
        priority: newPriority,
        max_concurrent_calls: 5
      }
    });
    
  } catch (error) {
    logger.error('SIP追加エラー:', error);
    res.status(500).json({
      success: false,
      message: 'SIPアカウントの追加に失敗しました',
      error: error.message
    });
  }
});

// SIP削除API
router.delete('/sip-accounts/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    logger.info(`🗑️ SIP削除要求: ID=${id}`);
    
    // 🔍 存在確認
    const [existing] = await db.query(
      'SELECT id, sip_username, dtmf_key, current_calls FROM transfer_sip_assignments WHERE id = ?',
      [id]
    );
    
    if (existing.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'SIPアカウントが見つかりません'
      });
    }
    
    const sipAccount = existing[0];
    
    // 🔍 通話中チェック
    if (sipAccount.current_calls > 0) {
      return res.status(409).json({
        success: false,
        message: `SIP "${sipAccount.sip_username}" は現在 ${sipAccount.current_calls} 通話中のため削除できません`,
        suggestion: 'リセットボタンで通話数をリセットしてから削除してください'
      });
    }
    
    // 🗑️ データベース削除
    const [result] = await db.query(
      'DELETE FROM transfer_sip_assignments WHERE id = ?',
      [id]
    );
    
    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'SIPアカウントの削除に失敗しました'
      });
    }
    
    logger.info(`✅ SIP削除成功: ID=${id}, SIP=${sipAccount.sip_username}`);
    
    res.json({
      success: true,
      message: 'SIPアカウントを削除しました',
      deleted: {
        id: parseInt(id),
        sip_username: sipAccount.sip_username,
        dtmf_key: sipAccount.dtmf_key
      }
    });
    
  } catch (error) {
    logger.error('SIP削除エラー:', error);
    res.status(500).json({
      success: false,
      message: 'SIPアカウントの削除に失敗しました',
      error: error.message
    });
  }
});

// 利用可能なSIPアカウント一覧取得API
router.get('/available-sip-accounts/:callerId', async (req, res) => {
  try {
    const callerIdId = req.params.callerId;
    
    const [availableAccounts] = await db.query(`
      SELECT 
        cc.username as sip_username,
        ci.description
      FROM caller_channels cc
      JOIN caller_ids ci ON cc.caller_id_id = ci.id
      WHERE cc.caller_id_id = ? AND cc.status = 'available' AND ci.active = true
      ORDER BY cc.username
    `, [callerIdId]);
    
    const [usedAccounts] = await db.query(`
      SELECT DISTINCT sip_username FROM transfer_sip_assignments 
      WHERE caller_id_id = ? AND active = 1
    `, [callerIdId]);
    
    const usedUsernames = usedAccounts.map(acc => acc.sip_username);
    const filteredAccounts = availableAccounts.filter(acc => 
      !usedUsernames.includes(acc.sip_username)
    );
    
    res.json({ success: true, accounts: filteredAccounts });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
