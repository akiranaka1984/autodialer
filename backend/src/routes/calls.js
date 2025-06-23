const express = require('express');
const router = express.Router();
const callController = require("../controllers/callController");
const db = require('../services/database');
const dialerService = require('../services/dialerService');
const logger = require('../services/logger');

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

// 通話終了通知（Asteriskから呼び出し）
router.post('/end', async (req, res) => {
  try {
    const { callId, duration, disposition, keypress } = req.body;
    
    if (!callId) {
      return res.status(400).json({ message: '通話IDが必要です' });
    }
    
    logger.info(`通話終了通知: CallID=${callId}, Duration=${duration}, Disposition=${disposition}, Keypress=${keypress}`);
    
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
