// ========================================
// backend/src/routes/leads.js
// ========================================
// このファイルはURL（例：/api/leads）と処理をつなげる役割

const express = require('express');
const router = express.Router();
const leadService = require('../services/leadService');
const logger = require('../services/logger');

// ========================================
// 1. キャンペーンの設定を取得
// GET /api/leads/campaigns/:id/settings
// 例：キャンペーン1の設定を見る → /api/leads/campaigns/1/settings
// ========================================
router.get('/campaigns/:id/settings', async (req, res) => {
  try {
    const campaignId = req.params.id;
    logger.info(`設定取得リクエスト: キャンペーン${campaignId}`);
    
    const settings = await leadService.getCampaignSettings(campaignId);
    
    res.json({
      success: true,
      settings: settings
    });
    
  } catch (error) {
    logger.error('設定取得エラー:', error);
    res.status(500).json({
      success: false,
      message: 'エラーが発生しました'
    });
  }
});

// ========================================
// 2. キャンペーンの設定を更新（5秒、10秒、15秒などに変更）
// PUT /api/leads/campaigns/:id/settings
// 送るデータ例：{ "threshold_seconds": 10 }
// ========================================
router.put('/campaigns/:id/settings', async (req, res) => {
  try {
    const campaignId = req.params.id;
    const { threshold_seconds } = req.body;
    
    // 入力チェック
    if (!threshold_seconds) {
      return res.status(400).json({
        success: false,
        message: '秒数（threshold_seconds）を指定してください'
      });
    }
    
    // 数値チェック（5〜60秒のみ許可）
    const seconds = parseInt(threshold_seconds);
    if (isNaN(seconds) || seconds < 5 || seconds > 60) {
      return res.status(400).json({
        success: false,
        message: '秒数は5〜60の間で指定してください'
      });
    }
    
    logger.info(`設定更新: キャンペーン${campaignId} → ${seconds}秒`);
    
    const result = await leadService.updateCampaignSettings(campaignId, seconds);
    
    res.json({
      success: true,
      message: `判定時間を${seconds}秒に変更しました`,
      new_threshold: seconds
    });
    
  } catch (error) {
    logger.error('設定更新エラー:', error);
    res.status(500).json({
      success: false,
      message: 'エラーが発生しました'
    });
  }
});

// ========================================
// 3. 見込み客リストを取得
// GET /api/leads/campaigns/:id/hot-leads
// クエリ例：?custom_threshold=20 （20秒以上で絞り込み）
// ========================================
router.get('/campaigns/:id/hot-leads', async (req, res) => {
  try {
    const campaignId = req.params.id;
    
    // オプション設定
    const options = {
      limit: parseInt(req.query.limit) || 100,
      offset: parseInt(req.query.offset) || 0,
      customThreshold: parseInt(req.query.custom_threshold) || null
    };
    
    logger.info(`見込み客リスト取得: キャンペーン${campaignId}`);
    
    const result = await leadService.getHotLeads(campaignId, options);
    
    res.json({
      success: true,
      ...result
    });
    
  } catch (error) {
    logger.error('リスト取得エラー:', error);
    res.status(500).json({
      success: false,
      message: 'エラーが発生しました'
    });
  }
});

// ========================================
// 4. CSVエクスポート
// GET /api/leads/campaigns/:id/export
// クエリ例：?threshold=15 （15秒以上をエクスポート）
// ========================================
router.get('/campaigns/:id/export', async (req, res) => {
  try {
    const campaignId = req.params.id;
    const threshold = parseInt(req.query.threshold) || null;
    
    logger.info(`CSVエクスポート: キャンペーン${campaignId}`);
    
    const data = await leadService.exportHotLeads(campaignId, threshold);
    
    // CSVフォーマットに変換
    if (data.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'データがありません'
      });
    }
    
    // ヘッダー行を作成
    const headers = Object.keys(data[0]);
    let csv = headers.join(',') + '\n';
    
    // データ行を追加
    data.forEach(row => {
      const values = headers.map(header => {
        const value = row[header] || '';
        // カンマや改行を含む場合は引用符で囲む
        return value.toString().includes(',') || value.toString().includes('\n') 
          ? `"${value}"` 
          : value;
      });
      csv += values.join(',') + '\n';
    });
    
    // ファイル名を作成
    const filename = `hot_leads_campaign_${campaignId}_${new Date().toISOString().split('T')[0]}.csv`;
    
    // CSVファイルとして送信
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send('\uFEFF' + csv); // BOM付きでExcelでも文字化けしない
    
  } catch (error) {
    logger.error('エクスポートエラー:', error);
    res.status(500).json({
      success: false,
      message: 'エラーが発生しました'
    });
  }
});

// ========================================
// 5. 通話終了時の処理（自動で呼ばれる）
// POST /api/leads/process-call
// ========================================
router.post('/process-call', async (req, res) => {
  try {
    const { campaign_id, phone_number, duration } = req.body;
    
    // 入力チェック
    if (!campaign_id || !phone_number || duration === undefined) {
      return res.status(400).json({
        success: false,
        message: '必須パラメータが不足しています'
      });
    }
    
    logger.info(`通話処理: キャンペーン${campaign_id}, ${phone_number}, ${duration}秒`);
    
    // 見込み客判定処理
    await leadService.processCallEnd({
      campaign_id,
      phone_number,
      duration: parseInt(duration)
    });
    
    res.json({
      success: true,
      message: '処理完了'
    });
    
  } catch (error) {
    logger.error('通話処理エラー:', error);
    res.status(500).json({
      success: false,
      message: 'エラーが発生しました'
    });
  }
});

// ========================================
// 6. 統計情報を取得
// GET /api/leads/campaigns/:id/stats
// ========================================
router.get('/campaigns/:id/stats', async (req, res) => {
  try {
    const campaignId = req.params.id;
    
    // 各閾値での人数を取得
    const [stats] = await db.query(`
      SELECT 
        COUNT(CASE WHEN max_duration >= 5 THEN 1 END) as over_5_sec,
        COUNT(CASE WHEN max_duration >= 10 THEN 1 END) as over_10_sec,
        COUNT(CASE WHEN max_duration >= 15 THEN 1 END) as over_15_sec,
        COUNT(CASE WHEN max_duration >= 20 THEN 1 END) as over_20_sec,
        COUNT(CASE WHEN max_duration >= 30 THEN 1 END) as over_30_sec,
        AVG(max_duration) as avg_duration,
        MAX(max_duration) as max_duration
      FROM hot_leads
      WHERE campaign_id = ?
    `, [campaignId]);
    
    res.json({
      success: true,
      stats: stats[0]
    });
    
  } catch (error) {
    logger.error('統計取得エラー:', error);
    res.status(500).json({
      success: false,
      message: 'エラーが発生しました'
    });
  }
});

module.exports = router;

// ========================================
// 💡 backend/src/index.js に追加する内容
// ========================================
// const leadsRouter = require('./routes/leads');
// app.use('/api/leads', leadsRouter);
// ========================================
