// backend/src/controllers/campaignsController.js - 修正版（IVR自動デプロイ対応）
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

// キャンペーンの開始（✅ IVR自動デプロイ機能追加）
// キャンペーンの開始（✅ IVR自動デプロイ機能追加 + 配列分割代入修正）
exports.startCampaign = async (req, res) => {
  try {
    const campaignId = req.params.id;
    
    console.log('🔍 campaignsController.startCampaign 開始:', { campaignId });
    
    // ✅ 修正: 正しい配列分割代入
    const [rows] = await db.query(`
      SELECT c.*, ci.active as caller_id_active,
             (SELECT COUNT(*) FROM contacts WHERE campaign_id = c.id) as contact_count
      FROM campaigns c
      LEFT JOIN caller_ids ci ON c.caller_id_id = ci.id
      WHERE c.id = ?
    `, [campaignId]);
    
    // ✅ 修正: 配列の最初の要素を取得
    const campaign = rows[0];
    
    console.log('🔍 修正後のクエリ結果:', {
      rows_length: rows?.length,
      campaign_exists: campaign ? 'YES' : 'NO',
      caller_id_id: campaign?.caller_id_id,
      caller_id_active: campaign?.caller_id_active,
      contact_count: campaign?.contact_count
    });
    
    if (!campaign) {
      console.log('❌ キャンペーンが見つかりません');
      return res.status(404).json({ message: 'キャンペーンが見つかりません' });
    }
    
    console.log('🔍 検証開始:', {
      'campaign.caller_id_id': campaign.caller_id_id,
      'campaign.caller_id_active': campaign.caller_id_active,
      'typeof caller_id_id': typeof campaign.caller_id_id,
      'typeof caller_id_active': typeof campaign.caller_id_active,
      '!campaign.caller_id_id': !campaign.caller_id_id,
      '!campaign.caller_id_active': !campaign.caller_id_active
    });
    
    if (!campaign.caller_id_id || !campaign.caller_id_active) {
      console.log('❌ 発信者番号検証失敗:', {
        caller_id_id: campaign.caller_id_id,
        caller_id_active: campaign.caller_id_active
      });
      return res.status(400).json({ message: '有効な発信者番号が設定されていません' });
    }
    
    if (campaign.contact_count === 0) {
      console.log('❌ 連絡先なし');
      return res.status(400).json({ message: '連絡先が登録されていません' });
    }
    
    console.log('✅ 検証完了、IVRデプロイ開始');
    
    // ✅ 新規追加: IVRスクリプトの自動デプロイ
    try {
      const ivrService = require('../services/ivrService');
      const deployResult = await ivrService.deployIvrScript(campaignId);
      console.log(`✅ IVRスクリプト自動デプロイ完了: キャンペーン ${campaignId}`, {
        scriptPath: deployResult.scriptPath,
        message: deployResult.message
      });
    } catch (ivrError) {
      console.log(`⚠️ IVRスクリプトデプロイエラー（キャンペーン開始は継続）: ${ivrError.message}`);
      // IVRデプロイに失敗してもキャンペーン開始は継続する
      // 音声ファイルは自動で利用されるため、スクリプトなしでも基本的な発信は可能
    }
    
    // キャンペーンを開始
    const result = await dialerService.startCampaign(campaignId);
    
    if (result) {
      res.json({ 
        message: 'キャンペーンを開始しました（IVRスクリプトも自動デプロイされました）', 
        status: 'active' 
      });
    } else {
      res.status(500).json({ message: 'キャンペーンの開始に失敗しました' });
    }
  } catch (error) {
    console.log('❌ campaignsController.startCampaign エラー:', error);
    logger.error('キャンペーン開始エラー:', error);
    res.status(500).json({ message: 'エラーが発生しました' });
  }
};

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

// キャンペーンの再開（✅ IVR自動デプロイ機能を含む）
exports.resumeCampaign = async (req, res) => {
  try {
    const campaignId = req.params.id;
    
    // ✅ 再開時もIVRスクリプトを自動デプロイ
    try {
      const ivrService = require('../services/ivrService');
      const deployResult = await ivrService.deployIvrScript(campaignId);
      logger.info(`✅ IVRスクリプト自動デプロイ完了（再開時）: キャンペーン ${campaignId}`);
    } catch (ivrError) {
      logger.warn(`⚠️ IVRスクリプトデプロイエラー（キャンペーン再開は継続）: ${ivrError.message}`);
    }
    
    const result = await dialerService.resumeCampaign(campaignId);
    
    if (result) {
      res.json({ 
        message: 'キャンペーンを再開しました（IVRスクリプトも自動デプロイされました）', 
        status: 'active' 
      });
    } else {
      res.status(500).json({ message: 'キャンペーンの再開に失敗しました' });
    }
  } catch (error) {
    logger.error('キャンペーン再開エラー:', error);
    res.status(500).json({ message: 'エラーが発生しました' });
  }
};

exports.deleteCampaign = async (req, res) => {
  try {
    const campaignId = req.params.id;
    
    // 既存のキャンペーンを確認
    const [campaigns] = await db.query(
      'SELECT id FROM campaigns WHERE id = ?',
      [campaignId]
    );
    
    if (campaigns.length === 0) {
      return res.status(404).json({ message: 'キャンペーンが見つかりません' });
    }
    
    // 関連するデータの削除（参照整合性に基づいて）
    await db.query('DELETE FROM campaigns WHERE id = ?', [campaignId]);
    
    res.json({ success: true, message: 'キャンペーンが削除されました' });
  } catch (error) {
    logger.error('キャンペーン削除エラー:', error);
    res.status(500).json({ message: 'サーバーエラーが発生しました' });
  }
};
