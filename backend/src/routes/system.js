// backend/src/routes/system.js (新規作成)
const express = require('express');
const router = express.Router();
const dialerService = require('../services/dialerService');
const callService = require('../services/callService');
const logger = require('../services/logger');

// 🩺 システムヘルスチェック
router.get('/health', async (req, res) => {
  try {
    const healthData = {
      timestamp: new Date().toISOString(),
      dialer: dialerService.getHealthStatus(),
      callService: callService.getProvidersStatus(),
      system: {
        nodeVersion: process.version,
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage(),
        environment: process.env.NODE_ENV
      }
    };
    
    res.json({
      success: true,
      data: healthData
    });
  } catch (error) {
    logger.error('ヘルスチェックエラー:', error);
    res.status(500).json({
      success: false,
      message: 'ヘルスチェックに失敗しました',
      error: error.message
    });
  }
});

// 🔧 発信ジョブ手動実行
router.post('/dialer/execute', async (req, res) => {
  try {
    logger.info('手動発信ジョブ実行リクエスト受信');
    
    const result = await dialerService.executeDialerJobManually();
    
    res.json({
      success: true,
      message: '発信ジョブを手動実行しました',
      data: result
    });
  } catch (error) {
    logger.error('手動発信ジョブエラー:', error);
    res.status(500).json({
      success: false,
      message: '発信ジョブの実行に失敗しました',
      error: error.message
    });
  }
});

// 📊 キャンペーン詳細統計
router.get('/campaigns/:id/detailed-stats', async (req, res) => {
  try {
    const { id } = req.params;
    
    const stats = await dialerService.getCampaignDetailedStats(id);
    
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    logger.error(`キャンペーン詳細統計エラー: ${req.params.id}`, error);
    res.status(500).json({
      success: false,
      message: 'キャンペーン統計の取得に失敗しました',
      error: error.message
    });
  }
});

// 🛠️ システム設定更新
router.post('/settings/update', async (req, res) => {
  try {
    const settings = req.body;
    
    const updatedSettings = dialerService.updateSystemSettings(settings);
    
    res.json({
      success: true,
      message: 'システム設定を更新しました',
      data: updatedSettings
    });
  } catch (error) {
    logger.error('システム設定更新エラー:', error);
    res.status(500).json({
      success: false,
      message: 'システム設定の更新に失敗しました',
      error: error.message
    });
  }
});

// 🚨 緊急停止
router.post('/emergency-stop', async (req, res) => {
  try {
    const { reason } = req.body;
    
    logger.warn(`🚨 緊急停止API実行: ${reason || '管理者による手動停止'}`);
    
    const stopResult = await dialerService.emergencyStopAll(reason || '管理者による手動停止');
    
    res.json({
      success: true,
      message: '緊急停止を実行しました',
      data: stopResult
    });
  } catch (error) {
    logger.error('緊急停止APIエラー:', error);
    res.status(500).json({
      success: false,
      message: '緊急停止の実行に失敗しました',
      error: error.message
    });
  }
});

// 🔄 発信ジョブ再起動
router.post('/dialer/restart', async (req, res) => {
  try {
    logger.info('発信ジョブ再起動リクエスト受信');
    
    // まず停止
    dialerService.dialerJobRunning = false;
    
    // 2秒待機
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // 再起動
    dialerService.startDialerJob();
    
    res.json({
      success: true,
      message: '発信ジョブを再起動しました',
      data: {
        timestamp: new Date().toISOString(),
        status: 'restarted'
      }
    });
  } catch (error) {
    logger.error('発信ジョブ再起動エラー:', error);
    res.status(500).json({
      success: false,
      message: '発信ジョブの再起動に失敗しました',
      error: error.message
    });
  }
});

// 📈 リアルタイム統計
router.get('/stats/realtime', async (req, res) => {
  try {
    const activeCampaigns = Array.from(dialerService.activeCampaigns.entries());
    const realtimeStats = [];
    
    for (const [campaignId, campaign] of activeCampaigns) {
      try {
        const detailedStats = await dialerService.getCampaignDetailedStats(campaignId);
        realtimeStats.push(detailedStats);
      } catch (error) {
        logger.warn(`キャンペーン${campaignId}の統計取得スキップ:`, error.message);
      }
    }
    
    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      data: {
        totalActiveCampaigns: activeCampaigns.length,
        totalActiveCalls: dialerService.activeCalls.size,
        campaigns: realtimeStats
      }
    });
  } catch (error) {
    logger.error('リアルタイム統計エラー:', error);
    res.status(500).json({
      success: false,
      message: 'リアルタイム統計の取得に失敗しました',
      error: error.message
    });
  }
});

module.exports = router;
