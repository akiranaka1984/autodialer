const express = require('express');
const router = express.Router();
const db = require('../services/database');
const dialerService = require('../services/dialerService');
const logger = require('../services/logger');
const auth = require('../middleware/auth');

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

// 通話履歴の取得（管理画面用）
router.get('/', auth, async (req, res) => {
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
router.get('/:id', auth, async (req, res) => {
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

module.exports = router;