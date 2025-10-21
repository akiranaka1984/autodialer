const express = require('express');
const router = express.Router();
const callController = require("../controllers/callController");
const db = require('../services/database');
const dialerService = require('../services/dialerService');
const logger = require('../services/logger');
const leadService = require('../services/leadService');

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
    const { callId, campaignId, keypress, customerPhone } = req.body;
    
    if (!callId || !campaignId || !keypress) {
      return res.status(400).json({ message: '必須パラメータが不足しています' });
    }
    
    logger.info(`📞 Phase2 転送キー入力: CallID=${callId}, Campaign=${campaignId}, Key=${keypress}`);
    
    // キーが1,2,3の場合は転送処理
    if (['1', '2', '3'].includes(keypress)) {
      // キャンペーン情報を取得
      const [campaigns] = await db.query(`
        SELECT id, caller_id_id, name
        FROM campaigns 
        WHERE id = ?
      `, [campaignId]);
      
      if (campaigns.length === 0) {
        return res.status(404).json({ success: false, message: 'キャンペーンが見つかりません' });
      }
      
      const campaign = campaigns[0];
      const callerIdId = campaign.caller_id_id;
      
      // 転送先SIPアカウントを取得（負荷分散）
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
          message: `転送先が設定されていません`
        });
      }
      
      // 最適なSIPアカウントを選択
      const availableAccounts = sipAccounts.filter(acc => 
        acc.current_calls < acc.max_concurrent_calls && acc.active === 1
      );
      
      if (availableAccounts.length === 0) {
        return res.status(503).json({
          success: false,
          message: '現在利用可能な転送先がありません'
        });
      }
      
      // 負荷分散選択
      availableAccounts.sort((a, b) => {
        if (a.current_calls !== b.current_calls) return a.current_calls - b.current_calls;
        if (a.priority !== b.priority) return b.priority - a.priority;
        return a.id - b.id;
      });
      
      const selectedSip = availableAccounts[0];
      
      // 通話数を増加
      await db.query(`
        UPDATE transfer_sip_assignments 
        SET current_calls = current_calls + 1 
        WHERE sip_username = ?
      `, [selectedSip.sip_username]);
      
      // 転送ログ記録
      await db.query(`
        INSERT INTO transfer_logs 
        (original_call_id, campaign_id, original_number, transfer_number, keypress, transfer_initiated_at, status)
        VALUES (?, ?, ?, ?, ?, NOW(), 'initiated')
      `, [callId, campaignId, customerPhone || '', selectedSip.sip_username, keypress]);
      
      logger.info(`✅ 転送先決定: ${selectedSip.sip_username} (${selectedSip.current_calls + 1}/${selectedSip.max_concurrent_calls})`);
      
      // 成功レスポンス（transfer_notify.shが期待する形式）
      return res.json({
        success: true,
        transfer: {
          selectedSip: selectedSip.sip_username,
          campaignId: parseInt(campaignId),
          keypress: keypress
        }
      });
    }
    
    // キー9またはその他の場合は通常の記録のみ
    await db.query(
      'UPDATE call_logs SET keypress = ? WHERE call_id = ?',
      [keypress, callId]
    );
    
    res.json({ success: true });
  } catch (error) {
    logger.error('転送処理エラー:', error);
    res.status(500).json({ message: error.message });
  }
});

// 通話終了通知（Asteriskから呼び出し）
router.post('/end', async (req, res) => {
  try {
    const { callId, duration, disposition, keypress } = req.body;
    
    if (!callId) {
      return res.status(400).json({ message: '通話IDが必要です' });
    }
    
    logger.info(`通話終了通知: CallID=${callId}, Duration=${duration}, Disposition=${disposition}, Keypress=${keypress}`);
        // ===== ここから追加（134行目あたり） =====
    // 見込み客判定処理
    if (duration && duration > 0) {
      const [callLogs] = await db.query(
        'SELECT campaign_id, phone_number FROM call_logs WHERE call_id = ?',
        [callId]
      );
      
      if (callLogs.length > 0) {
        const callLog = callLogs[0];
        await leadService.processCallEnd({
          campaign_id: callLog.campaign_id,
          phone_number: callLog.phone_number,
          duration: parseInt(duration)
        });
        logger.info(`見込み客判定完了: ${callLog.phone_number} (${duration}秒)`);
      }
    }
    // ===== ここまで追加 =====    
    // 通話終了処理
    await dialerService.handleCallEnd(callId, duration, disposition, keypress);
    
    res.json({ success: true });
  } catch (error) {
    logger.error('通話終了通知エラー:', error);
    res.status(500).json({ message: error.message });
  }
});

// 🔥 転送実行API（DTMF検知用）- 動的転送対応版
router.post('/transfer/dtmf', async (req, res) => {
  try {
    const { callId, originalNumber, keypress, campaignId } = req.body;
    
    logger.info(`🔄 動的転送要求: CallID=${callId}, Key=${keypress}, Campaign=${campaignId}`);
    
    // 必須パラメータ検証
    if (!callId || !originalNumber || !keypress || !campaignId) {
      return res.status(400).json({ 
        success: false,
        message: '必須パラメータが不足しています (callId, originalNumber, keypress, campaignId)'
      });
    }
    
    // ✅ DTMFキーに基づく転送先選択
    const [destinations] = await db.query(`
      SELECT sip_username FROM campaign_transfer_destinations 
      WHERE campaign_id = ? AND dtmf_key = ? AND active = TRUE
    `, [campaignId, keypress]);
    
    if (destinations.length === 0) {
      return res.status(400).json({ 
        success: false,
        message: `キャンペーン${campaignId}のキー${keypress}に対応する転送先が設定されていません`
      });
    }
    
    const transferTarget = destinations[0].sip_username;
    logger.info(`✅ 転送先決定: Key=${keypress} → ${transferTarget}`);
    
    // 転送先SIPアカウント確認
    const [sipAccounts] = await db.query(`
      SELECT cc.username, cc.status, ci.number as caller_number
      FROM caller_channels cc 
      JOIN caller_ids ci ON cc.caller_id_id = ci.id 
      WHERE cc.username = ? AND cc.status = 'available'
    `, [transferTarget]);
    
    if (sipAccounts.length === 0) {
      return res.status(400).json({ 
        success: false,
        message: `転送先SIPアカウント ${transferTarget} が利用できません`
      });
    }
    
    // 転送ログ記録
    const transferId = `transfer-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    
    await db.query(`
      INSERT INTO transfer_logs 
      (original_call_id, transfer_number, keypress, status, transfer_initiated_at, original_number, campaign_id)
      VALUES (?, ?, ?, 'initiated', NOW(), ?, ?)
    `, [callId, transferTarget, keypress, originalNumber, campaignId]);
    
    // 転送実行
    const sipService = require('../services/sipService');
    const transferParams = {
      phoneNumber: sipAccounts[0].caller_number,
      callerID: `"Transfer from ${originalNumber}" <${originalNumber}>`,
      context: 'transfer',
      variables: {
        ORIGINAL_CALL_ID: callId,
        TRANSFER_TYPE: 'operator',
        CAMPAIGN_ID: campaignId,
        DTMF_KEY: keypress
      },
      provider: 'sip'
    };
    
    const transferResult = await sipService.originate(transferParams);
    
    if (transferResult && transferResult.ActionID) {
      // call_logsテーブル更新
      await db.query(`
        UPDATE call_logs
        SET transfer_attempted = 1, transfer_successful = 1, transfer_target = ?
        WHERE call_id = ?
      `, [transferTarget, callId]);
      
      res.json({
        success: true,
        transferId: transferId,
        transferTarget: transferTarget,
        campaignId: campaignId,
        dtmfKey: keypress,
        message: `キー${keypress}: ${transferTarget}への転送を開始しました`
      });
    } else {
      throw new Error('転送実行に失敗しました');
    }
    
  } catch (error) {
    logger.error('動的転送API処理エラー:', error);
    res.status(500).json({ 
      success: false,
      message: '転送処理中にエラーが発生しました', 
      error: error.message
    });
  }
});

// 🔥 DNC登録API（9キー用）
router.post('/dnc/add', async (req, res) => {
  try {
    const { callId, phoneNumber, keypress, reason } = req.body;
    
    logger.info(`🚫 DNC登録要求: Phone=${phoneNumber}, Keypress=${keypress}`);
    
    if (!phoneNumber) {
      return res.status(400).json({
        success: false,
        message: '電話番号が必要です'
      });
    }
    
    // DNCリストに登録
    await db.query(`
      INSERT IGNORE INTO dnc_list (phone, reason, created_at)
      VALUES (?, ?, NOW())
    `, [phoneNumber, reason || 'ユーザーリクエスト（9キー）']);
    
    // 通話ログ更新
    if (callId) {
      await db.query(`
        UPDATE call_logs SET keypress = ?, status = 'DNC' WHERE call_id = ?
      `, [keypress, callId]);
    }
    
    res.json({
      success: true,
      message: 'DNCリストに登録しました',
      phoneNumber: phoneNumber
    });
    
  } catch (error) {
    logger.error('DNC登録エラー:', error);
    res.status(500).json({ 
      success: false,
      message: 'DNC登録中にエラーが発生しました',
      error: error.message
    });
  }
});

router.post("/test", callController.testCall);

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

// 通話終了コールバック
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

module.exports = router;
