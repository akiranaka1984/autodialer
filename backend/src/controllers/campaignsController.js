const db = require('../services/database');
const logger = require('../services/logger');
const dialerService = require('../services/dialerService');

// キャンペーンの詳細を取得（連絡先・通話統計を含む）
exports.getCampaignDetails = async (req, res) => {
  try {
    const campaignId = req.params.id;
    
    // キャンペーン基本情報
    const [campaign] = await db.query(`
      SELECT c.*, 
             ci.number as caller_id_number,
             ci.description as caller_id_description,
             (SELECT COUNT(*) FROM contacts WHERE campaign_id = c.id) as total_contacts,
             (SELECT COUNT(*) FROM contacts WHERE campaign_id = c.id AND status = 'completed') as completed_contacts,
             (SELECT COUNT(*) FROM call_logs WHERE campaign_id = c.id) as total_calls,
             (SELECT COUNT(*) FROM call_logs WHERE campaign_id = c.id AND status = 'ANSWERED') as answered_calls
      FROM campaigns c
      LEFT JOIN caller_ids ci ON c.caller_id_id = ci.id
      WHERE c.id = ?
    `, [campaignId]);
    
    if (!campaign) {
      return res.status(404).json({ message: 'キャンペーンが見つかりません' });
    }
    
    // 進捗率の計算
    const progress = campaign.total_contacts > 0 
      ? Math.round((campaign.completed_contacts / campaign.total_contacts) * 100)
      : 0;
    
    res.json({
      ...campaign,
      progress,
      stats: {
        totalContacts: campaign.total_contacts,
        completedContacts: campaign.completed_contacts,
        totalCalls: campaign.total_calls,
        answeredCalls: campaign.answered_calls,
        answerRate: campaign.total_calls > 0 
          ? Math.round((campaign.answered_calls / campaign.total_calls) * 100)
          : 0
      }
    });
  } catch (error) {
    logger.error('キャンペーン詳細取得エラー:', error);
    res.status(500).json({ message: 'エラーが発生しました' });
  }
};

// キャンペーンの開始
exports.startCampaign = async (req, res) => {
  try {
    const campaignId = req.params.id;
    
    // キャンペーンの検証
    const [campaign] = await db.query(`
      SELECT c.*, ci.active as caller_id_active,
             (SELECT COUNT(*) FROM contacts WHERE campaign_id = c.id) as contact_count
      FROM campaigns c
      LEFT JOIN caller_ids ci ON c.caller_id_id = ci.id
      WHERE c.id = ?
    `, [campaignId]);
    
    if (!campaign) {
      return res.status(404).json({ message: 'キャンペーンが見つかりません' });
    }
    
    if (!campaign.caller_id_id || !campaign.caller_id_active) {
      return res.status(400).json({ message: '有効な発信者番号が設定されていません' });
    }
    
    if (campaign.contact_count === 0) {
      return res.status(400).json({ message: '連絡先が登録されていません' });
    }
    
    // キャンペーンを開始
    const result = await dialerService.startCampaign(campaignId);
    
    if (result) {
      res.json({ message: 'キャンペーンを開始しました', status: 'active' });
    } else {
      res.status(500).json({ message: 'キャンペーンの開始に失敗しました' });
    }
  } catch (error) {
    logger.error('キャンペーン開始エラー:', error);
    res.status(500).json({ message: 'エラーが発生しました' });
  }
};

// キャンペーンの一時停止
exports.pauseCampaign = async (req, res) => {
  try {
    const campaignId = req.params.id;
    
    const result = await dialerService.pauseCampaign(campaignId);
    
    if (result) {
      res.json({ message: 'キャンペーンを一時停止しました', status: 'paused' });
    } else {
      res.status(500).json({ message: 'キャンペーンの一時停止に失敗しました' });
    }
  } catch (error) {
    logger.error('キャンペーン一時停止エラー:', error);
    res.status(500).json({ message: 'エラーが発生しました' });
  }
};

// キャンペーンの再開
exports.resumeCampaign = async (req, res) => {
  try {
    const campaignId = req.params.id;
    
    const result = await dialerService.resumeCampaign(campaignId);
    
    if (result) {
      res.json({ message: 'キャンペーンを再開しました', status: 'active' });
    } else {
      res.status(500).json({ message: 'キャンペーンの再開に失敗しました' });
    }
  } catch (error) {
    logger.error('キャンペーン再開エラー:', error);
    res.status(500).json({ message: 'エラーが発生しました' });
  }
};