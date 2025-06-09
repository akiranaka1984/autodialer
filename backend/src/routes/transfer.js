const express = require('express');
const router = express.Router();
const db = require('../services/database');
const logger = require('../services/logger');

// 転送設定取得API
router.get('/campaigns/:id/transfer-settings', async (req, res) => {
  try {
    const campaignId = req.params.id;
    
    const [settings] = await db.query(`
      SELECT dtmf_key, sip_username, active, created_at, updated_at
      FROM campaign_transfer_destinations 
      WHERE campaign_id = ? 
      ORDER BY dtmf_key
    `, [campaignId]);
    
    res.json({
      success: true,
      campaignId: parseInt(campaignId),
      settings: settings,
      count: settings.length
    });
  } catch (error) {
    logger.error('転送設定取得エラー:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// 転送設定一括更新API
router.post('/campaigns/:id/transfer-settings', async (req, res) => {
  try {
    const campaignId = req.params.id;
    const { settings } = req.body;
    
    if (!Array.isArray(settings)) {
      return res.status(400).json({ success: false, message: '設定は配列形式で送信してください' });
    }
    
    // 既存設定削除
    await db.query('DELETE FROM campaign_transfer_destinations WHERE campaign_id = ?', [campaignId]);
    
    // 新設定追加
    for (const setting of settings) {
      await db.query(`
        INSERT INTO campaign_transfer_destinations (campaign_id, dtmf_key, sip_username, active)
        VALUES (?, ?, ?, ?)
      `, [campaignId, setting.dtmf_key, setting.sip_username, setting.active !== false]);
    }
    
    res.json({
      success: true,
      message: '転送設定を更新しました',
      campaignId: parseInt(campaignId),
      updatedCount: settings.length
    });
  } catch (error) {
    logger.error('転送設定更新エラー:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
