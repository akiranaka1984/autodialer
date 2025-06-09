const express = require('express');
const router = express.Router();
const db = require('../services/database');
const dialerService = require('../services/dialerService');
const logger = require('../services/logger');

// 🔄 通話数更新ヘルパー関数
const updateTransferCallCount = async (sipUsername, increment = 1) => {
  try {
    const [result] = await db.query(`
      UPDATE transfer_sip_assignments 
      SET current_calls = GREATEST(current_calls + ?, 0),
          updated_at = NOW()
      WHERE sip_username = ?
    `, [increment, sipUsername]);
    
    if (result.affectedRows > 0) {
      logger.info(`✅ 転送通話数更新: ${sipUsername} (${increment > 0 ? '+' : ''}${increment})`);
      return true;
    } else {
      logger.warn(`⚠️ 転送通話数更新対象なし: ${sipUsername}`);
      return false;
    }
  } catch (error) {
    logger.error(`❌ 転送通話数更新エラー: ${sipUsername}`, error);
    return false;
  }
};

// 通話開始通知（Asteriskから呼び出し）
router.post('/start', async (req, res) => {
  try {
    const { callId, campaignId, number } = req.body;
    
    if (!callId || !campaignId) {
      return res.status(400).json({ message: '必須パラメータが不足しています' });
    }
    
    logger.info(`通話開始通知: CallID=${callId}, Campaign=${campaignId}, Number=${number}`);
    
    res.json({ success: true });
  } catch (error) {
    logger.error('通話開始通知エラー:', error);
    res.status(500).json({ message: error.message });
  }
});

// キーパッド入力通知（Asteriskから呼び出し）
router.post('/keypress', async (req, res) => {
  try {
    const { callId, keypress } = req.body;
    
    if (!callId) {
      return res.status(400).json({ message: '通話IDが必要です' });
    }
    
    logger.info(`キーパッド入力: CallID=${callId}, Keypress=${keypress}`);
    
    // 通話ログの更新
    await db.query(
      'UPDATE call_logs SET keypress = ? WHERE call_id = ?',
      [keypress, callId]
    );
    
    res.json({ success: true });
  } catch (error) {
    logger.error('キーパッド入力通知エラー:', error);
    res.status(500).json({ message: error.message });
  }
});

// 🎯 通話終了通知（Asteriskから呼び出し）- 自動減算機能統合版
router.post('/end', async (req, res) => {
  try {
    const { callId, duration, disposition, keypress } = req.body;
    
    if (!callId) {
      return res.status(400).json({ message: '通話IDが必要です' });
    }
    
    logger.info(`📞 通話終了通知: CallID=${callId}, Duration=${duration}, Disposition=${disposition}, Keypress=${keypress}`);
    
    // 🎯 Phase2.2: 転送関連の通話数自動減算処理
    try {
      // 通話ログから転送情報を取得
      const [callLogs] = await db.query(`
        SELECT 
          transfer_attempted, 
          transfer_successful, 
          transfer_target, 
          campaign_id,
          phone_number,
          start_time
        FROM call_logs 
        WHERE call_id = ?
      `, [callId]);
      
      if (callLogs.length > 0) {
        const callLog = callLogs[0];
        
        // 転送が成功していた場合のみ減算処理
        if (callLog.transfer_attempted && callLog.transfer_successful && callLog.transfer_target) {
          const transferTarget = callLog.transfer_target;
          
          logger.info(`🔄 転送通話終了検出: ${callId} → ${transferTarget} (減算処理開始)`);
          
          // transfer_sip_assignmentsテーブルの通話数を減算
          const decrementSuccess = await updateTransferCallCount(transferTarget, -1);
          
          if (decrementSuccess) {
            // 減算後の状況を確認・ログ出力
            const [currentStatus] = await db.query(`
              SELECT current_calls, max_concurrent_calls, dtmf_key
              FROM transfer_sip_assignments 
              WHERE sip_username = ?
            `, [transferTarget]);
            
            if (currentStatus.length > 0) {
              const current = currentStatus[0].current_calls;
              const max = currentStatus[0].max_concurrent_calls;
              const key = currentStatus[0].dtmf_key;
              
              logger.info(`📊 転送通話数減算完了: ${transferTarget} (キー${key}) → ${current}/${max} 通話中`);
              
              // 転送ログも更新
              await db.query(`
                UPDATE transfer_logs 
                SET status = 'completed', transfer_ended_at = NOW(), duration = ?
                WHERE original_call_id = ?
              `, [duration || 0, callId]);
              
            }
            
          } else {
            logger.warn(`⚠️ 転送通話数減算失敗: ${transferTarget} (CallID: ${callId})`);
          }
          
        } else if (callLog.transfer_attempted && !callLog.transfer_successful) {
          logger.info(`📞 転送失敗通話終了: ${callId} (減算処理不要)`);
        } else {
          logger.debug(`📞 通常通話終了: ${callId} (転送なし)`);
        }
        
      } else {
        logger.warn(`⚠️ 通話ログが見つかりません: ${callId}`);
      }
      
    } catch (transferError) {
      logger.error('❌ 転送通話数減算処理エラー:', transferError);
      // 通話終了処理は続行（エラーでも止めない）
    }
    
    // 既存の通話終了処理を実行
    await dialerService.handleCallEnd(callId, duration, disposition, keypress);
    
    res.json({ 
      success: true,
      message: '通話終了処理完了',
      callId: callId
    });
    
  } catch (error) {
    logger.error('通話終了通知エラー:', error);
    res.status(500).json({ message: error.message });
  }
});

// 通話履歴の取得（管理画面用）
router.get('/', async (req, res) => {
  try {
    const { campaignId, limit = 100, offset = 0 } = req.query;
    
    let query = `
      SELECT cl.*, 
             c.phone as contact_phone, c.name as contact_name,
             ca.name as campaign_name,
             ci.number as caller_id_number
      FROM call_logs cl
      LEFT JOIN contacts c ON cl.contact_id = c.id
      LEFT JOIN campaigns ca ON cl.campaign_id = ca.id
      LEFT JOIN caller_ids ci ON cl.caller_id_id = ci.id
    `;
    
    const params = [];
    
    if (campaignId) {
      query += ' WHERE cl.campaign_id = ?';
      params.push(campaignId);
    }
    
    query += ' ORDER BY cl.start_time DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));
    
    const [calls] = await db.query(query, params);
    
    res.json(calls);
  } catch (error) {
    logger.error('通話履歴取得エラー:', error);
    res.status(500).json({ message: error.message });
  }
});

// 特定の通話の詳細取得
router.get('/:id', async (req, res) => {
  try {
    const [calls] = await db.query(`
      SELECT cl.*, 
             c.phone as contact_phone, c.name as contact_name, c.company as contact_company,
             ca.name as campaign_name, ca.script as campaign_script,
             ci.number as caller_id_number
      FROM call_logs cl
      LEFT JOIN contacts c ON cl.contact_id = c.id
      LEFT JOIN campaigns ca ON cl.campaign_id = ca.id
      LEFT JOIN caller_ids ci ON cl.caller_id_id = ci.id
      WHERE cl.id = ?
    `, [req.params.id]);
    
    if (calls.length === 0) {
      return res.status(404).json({ message: '通話が見つかりません' });
    }
    
    res.json(calls[0]);
  } catch (error) {
    logger.error('通話詳細取得エラー:', error);
    res.status(500).json({ message: error.message });
  }
});

// コールバック用通話終了API（既存との互換性維持）
router.post('/callback/call-end', async (req, res) => {
  try {
    const { callId, duration, disposition, keypress } = req.body;
    const dialerService = require('../services/dialerService');
    
    await dialerService.handleCallEnd(callId, duration, disposition, keypress);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 🎯 転送実行API - 通話数増加機能統合版
router.post('/transfer/dtmf', async (req, res) => {
  try {
    const { callId, originalNumber, transferTarget, keypress } = req.body;
    
    logger.info(`🔄 転送要求受信: CallID=${callId}, 転送先=${transferTarget}, キー=${keypress}`);
    
    // 必須パラメータ検証
    if (!callId || !originalNumber || !transferTarget || !keypress) {
      return res.status(400).json({ 
        success: false,
        message: '必須パラメータが不足しています (callId, originalNumber, transferTarget, keypress)'
      });
    }
    
    // 🎯 Phase2.2: 転送先SIPアカウントの通話数を事前に増加
    logger.info(`📈 転送開始前の通話数増加処理: ${transferTarget}`);
    
    const incrementSuccess = await updateTransferCallCount(transferTarget, 1);
    
    if (!incrementSuccess) {
      logger.warn(`⚠️ 転送先SIPアカウントが見つかりません: ${transferTarget}`);
      // 転送は継続するが、通話数管理対象外として扱う
    }
    
    // 転送先SIPアカウント確認（既存処理）
    const [sipAccounts] = await db.query(`
      SELECT cc.username, cc.status, ci.number as caller_number
      FROM caller_channels cc 
      JOIN caller_ids ci ON cc.caller_id_id = ci.id 
      WHERE cc.username = ? AND cc.status = 'available'
    `, [transferTarget]);
    
    if (sipAccounts.length === 0) {
      // 🔄 エラー時は通話数を元に戻す
      if (incrementSuccess) {
        await updateTransferCallCount(transferTarget, -1);
        logger.info(`🔄 転送失敗により通話数を戻しました: ${transferTarget}`);
      }
      
      return res.status(400).json({ 
        success: false,
        message: `転送先SIPアカウント ${transferTarget} が利用できません`
      });
    }
    
    // 転送ログ記録
    const transferId = `transfer-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    
    try {
      await db.query(`
        INSERT INTO transfer_logs 
        (original_call_id, original_number, transfer_number, keypress, transfer_initiated_at, status)
        VALUES (?, ?, ?, ?, NOW(), 'initiated')
      `, [callId, originalNumber, transferTarget, keypress]);
      
      logger.info(`📝 転送ログ記録: ${transferId} (${callId} → ${transferTarget})`);
      
    } catch (logError) {
      logger.error('転送ログ記録エラー:', logError);
      // ログエラーでも転送は継続
    }
    
    // 通話ログに転送情報を記録（重要）
    try {
      await db.query(`
        UPDATE call_logs
        SET transfer_attempted = 1, transfer_successful = 0, transfer_target = ?, keypress = ?
        WHERE call_id = ?
      `, [transferTarget, keypress, callId]);
      
      logger.info(`📝 通話ログ更新: 転送試行記録 (${callId})`);
      
    } catch (callLogError) {
      logger.error('通話ログ更新エラー:', callLogError);
    }
    
    // 実際の転送実行
    try {
      const sipService = require('../services/sipService');
      const transferParams = {
        phoneNumber: sipAccounts[0].caller_number,
        callerID: `"Transfer from ${originalNumber}" <${originalNumber}>`,
        context: 'transfer',
        variables: {
          ORIGINAL_CALL_ID: callId,
          TRANSFER_TYPE: 'operator',
          TRANSFER_TARGET: transferTarget,
          ORIGINAL_NUMBER: originalNumber
        },
        provider: 'sip'
      };
      
      logger.info(`📞 SIP転送実行開始: ${transferTarget}`);
      
      const transferResult = await sipService.originate(transferParams);
      
      if (transferResult && transferResult.ActionID) {
        // ✅ 転送成功 - 通話ログを成功に更新
        await db.query(`
          UPDATE call_logs
          SET transfer_successful = 1
          WHERE call_id = ?
        `, [callId]);
        
        // 転送ログも更新
        await db.query(`
          UPDATE transfer_logs 
          SET status = 'connected', transfer_connected_at = NOW()
          WHERE original_call_id = ?
        `, [callId]);
        
        logger.info(`✅ 転送実行成功: ${callId} → ${transferTarget} (転送CallID: ${transferResult.ActionID})`);
        
        res.json({
          success: true,
          transferId: transferId,
          transferCallId: transferResult.ActionID,
          transferTarget: transferTarget,
          message: `${transferTarget}への転送を開始しました`,
          data: {
            originalCallId: callId,
            transferCallId: transferResult.ActionID,
            transferTarget: transferTarget,
            keypress: keypress,
            callCountIncremented: incrementSuccess
          }
        });
        
      } else {
        throw new Error('SIP転送実行に失敗しました');
      }
      
    } catch (transferExecutionError) {
      logger.error('❌ 転送実行エラー:', transferExecutionError);
      
      // 🔄 転送失敗時は通話数を元に戻す
      if (incrementSuccess) {
        await updateTransferCallCount(transferTarget, -1);
        logger.info(`🔄 転送失敗により通話数をロールバック: ${transferTarget}`);
      }
      
      // 通話ログを失敗に更新
      await db.query(`
        UPDATE call_logs
        SET transfer_successful = 0
        WHERE call_id = ?
      `, [callId]);
      
      // 転送ログも更新
      await db.query(`
        UPDATE transfer_logs 
        SET status = 'failed'
        WHERE original_call_id = ?
      `, [callId]);
      
      throw transferExecutionError;
    }
    
  } catch (error) {
    logger.error('転送API処理エラー:', error);
    res.status(500).json({ 
      success: false,
      message: '転送処理中にエラーが発生しました', 
      error: error.message
    });
  }
});

// DNC登録API（9キー用）
router.post('/dnc/add', async (req, res) => {
  try {
    const { callId, phoneNumber, keypress, reason } = req.body;
    
    logger.info(`📝 DNC登録: ${phoneNumber} (CallID: ${callId}, キー: ${keypress})`);
    
    await db.query(`
      INSERT IGNORE INTO dnc_list (phone, reason, source, created_at)
      VALUES (?, ?, 'user_request', NOW())
    `, [phoneNumber, reason || 'ユーザーリクエスト（9キー）']);
    
    if (callId) {
      await db.query(`
        UPDATE call_logs SET keypress = ? WHERE call_id = ?
      `, [keypress, callId]);
    }
    
    logger.info(`✅ DNC登録完了: ${phoneNumber}`);
    
    res.json({
      success: true,
      message: 'DNCリストに登録しました',
      data: {
        phoneNumber: phoneNumber,
        reason: reason || 'ユーザーリクエスト（9キー）',
        callId: callId
      }
    });
    
  } catch (error) {
    logger.error('DNC登録エラー:', error);
    res.status(500).json({ 
      success: false,
      error: error.message
    });
  }
});

// 🎯 新規: 通話転送状況取得API
router.get('/transfer-status/:callId', async (req, res) => {
  try {
    const callId = req.params.callId;
    
    // 通話ログから転送情報取得
    const [callInfo] = await db.query(`
      SELECT 
        call_id,
        transfer_attempted,
        transfer_successful,
        transfer_target,
        keypress,
        start_time,
        end_time,
        duration
      FROM call_logs 
      WHERE call_id = ?
    `, [callId]);
    
    // 転送ログからも詳細情報取得
    const [transferInfo] = await db.query(`
      SELECT 
        status,
        transfer_initiated_at,
        transfer_connected_at,
        transfer_ended_at,
        duration
      FROM transfer_logs 
      WHERE original_call_id = ?
      ORDER BY transfer_initiated_at DESC
      LIMIT 1
    `, [callId]);
    
    if (callInfo.length === 0) {
      return res.status(404).json({
        success: false,
        message: '通話情報が見つかりません'
      });
    }
    
    const call = callInfo[0];
    const transfer = transferInfo.length > 0 ? transferInfo[0] : null;
    
    res.json({
      success: true,
      callId: callId,
      transferStatus: {
        attempted: call.transfer_attempted === 1,
        successful: call.transfer_successful === 1,
        target: call.transfer_target,
        keypress: call.keypress,
        status: transfer ? transfer.status : 'none',
        timeline: {
          callStart: call.start_time,
          transferInitiated: transfer ? transfer.transfer_initiated_at : null,
          transferConnected: transfer ? transfer.transfer_connected_at : null,
          transferEnded: transfer ? transfer.transfer_ended_at : null,
          callEnd: call.end_time
        },
        duration: {
          total: call.duration,
          transfer: transfer ? transfer.duration : null
        }
      }
    });
    
  } catch (error) {
    logger.error('転送状況取得エラー:', error);
    res.status(500).json({
      success: false,
      message: '転送状況の取得に失敗しました',
      error: error.message
    });
  }
});

module.exports = router;
