// backend/src/routes/stats.js
const express = require('express');
const router = express.Router();
const db = require('../services/database');


// 認証ミドルウェアを適用（認証が必要なエンドポイントのみ）


// ダッシュボード用の統計データを取得
router.get('/dashboard', async (req, res) => {
  try {
    // アクティブなキャンペーン数
    const activeCampaigns = await db.query(
      'SELECT COUNT(*) as count FROM campaigns WHERE status = "active"'
    );
    
    // 総連絡先数
    const totalContacts = await db.query(
      'SELECT COUNT(*) as count FROM contacts'
    );
    
    // 発信した通話数
    const totalCalls = await db.query(
      'SELECT COUNT(*) as count FROM call_logs'
    );
    
    // 応答した通話数（ANSWERED）
    const answeredCalls = await db.query(
      'SELECT COUNT(*) as count FROM call_logs WHERE status = "ANSWERED"'
    );
    
    // 今日の通話数
    const todayCalls = await db.query(`
      SELECT COUNT(*) as count FROM call_logs 
      WHERE DATE(start_time) = CURDATE()
    `);
    
    // 発信者番号ごとの通話数
    const callerIdStats = await db.query(`
      SELECT ci.id, ci.number, COUNT(cl.id) as call_count
      FROM caller_ids ci
      LEFT JOIN call_logs cl ON ci.id = cl.caller_id_id
      GROUP BY ci.id
      ORDER BY call_count DESC
      LIMIT 5
    `);
    
    // DNCリスト（発信拒否リスト）の件数
    const dncCount = await db.query(
      'SELECT COUNT(*) as count FROM dnc_list'
    );
    
    // レスポンスの構築
    res.json({
      active_campaigns: activeCampaigns[0].count,
      total_contacts: totalContacts[0].count,
      total_calls: totalCalls[0].count,
      answered_calls: answeredCalls[0].count,
      today_calls: todayCalls[0].count,
      answer_rate: totalCalls[0].count > 0 
        ? Math.round((answeredCalls[0].count / totalCalls[0].count) * 100) 
        : 0,
      caller_id_stats: callerIdStats,
      dnc_count: dncCount[0].count
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// キャンペーン別の通話統計を取得
router.get('/campaigns/:id', async (req, res) => {
  try {
    const campaignId = req.params.id;
    
    // キャンペーンの基本情報
    const campaigns = await db.query(
      'SELECT * FROM campaigns WHERE id = ?',
      [campaignId]
    );
    
    if (campaigns.length === 0) {
      return res.status(404).json({ message: 'キャンペーンが見つかりません' });
    }
    
    // 通話ステータス別の集計
    const statusStats = await db.query(`
      SELECT 
        status, 
        COUNT(*) as count,
        AVG(duration) as avg_duration
      FROM call_logs
      WHERE campaign_id = ?
      GROUP BY status
    `, [campaignId]);
    
    // キーパッド入力別の集計
    const keypressStats = await db.query(`
      SELECT 
        keypress, 
        COUNT(*) as count
      FROM call_logs
      WHERE campaign_id = ? AND keypress IS NOT NULL
      GROUP BY keypress
    `, [campaignId]);
    
    // 日別の通話数
    const dailyStats = await db.query(`
      SELECT 
        DATE(start_time) as date,
        COUNT(*) as total,
        SUM(CASE WHEN status = 'ANSWERED' THEN 1 ELSE 0 END) as answered
      FROM call_logs
      WHERE campaign_id = ?
      GROUP BY DATE(start_time)
      ORDER BY date DESC
      LIMIT 7
    `, [campaignId]);
    
    // 時間帯別の通話数
    const hourlyStats = await db.query(`
      SELECT 
        HOUR(start_time) as hour,
        COUNT(*) as total,
        SUM(CASE WHEN status = 'ANSWERED' THEN 1 ELSE 0 END) as answered
      FROM call_logs
      WHERE campaign_id = ?
      GROUP BY HOUR(start_time)
      ORDER BY hour
    `, [campaignId]);
    
    res.json({
      campaign: campaigns[0],
      status_stats: statusStats,
      keypress_stats: keypressStats,
      daily_stats: dailyStats,
      hourly_stats: hourlyStats
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// 通話履歴の統計情報
router.get('/calls', async (req, res) => {
  try {
    const { period } = req.query;
    
    // 期間フィルターの設定
    let timeFilter = '';
    let params = [];
    
    if (period) {
      const now = new Date();
      let startDate = new Date();
      
      switch (period) {
        case 'today':
          startDate.setHours(0, 0, 0, 0);
          break;
        case 'yesterday':
          startDate.setDate(startDate.getDate() - 1);
          startDate.setHours(0, 0, 0, 0);
          now.setDate(now.getDate() - 1);
          now.setHours(23, 59, 59, 999);
          break;
        case 'week':
          startDate.setDate(startDate.getDate() - 7);
          break;
        case 'month':
          startDate.setMonth(startDate.getMonth() - 1);
          break;
        default:
          return res.status(400).json({ message: '無効な期間パラメータ' });
      }
      
      timeFilter = ' WHERE start_time BETWEEN ? AND ?';
      params = [startDate, now];
    }
    
    // 通話総数と結果の内訳を取得
    const totalQuery = `
      SELECT 
        COUNT(*) as total_calls,
        SUM(CASE WHEN status = 'ANSWERED' THEN 1 ELSE 0 END) as answered,
        SUM(CASE WHEN status = 'NO ANSWER' THEN 1 ELSE 0 END) as no_answer,
        SUM(CASE WHEN status = 'BUSY' THEN 1 ELSE 0 END) as busy,
        SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END) as failed,
        SUM(CASE WHEN status NOT IN ('ANSWERED', 'NO ANSWER', 'BUSY', 'FAILED') THEN 1 ELSE 0 END) as other,
        AVG(duration) as avg_duration
      FROM call_logs
      ${timeFilter}
    `;
    
    const [totalStats] = await db.query(totalQuery, params);
    
    // 日別の通話数
    const dailyQuery = `
      SELECT 
        DATE(start_time) as date,
        COUNT(*) as total,
        SUM(CASE WHEN status = 'ANSWERED' THEN 1 ELSE 0 END) as answered
      FROM call_logs
      ${timeFilter}
      GROUP BY DATE(start_time)
      ORDER BY date DESC
      LIMIT 14
    `;
    
    const dailyStats = await db.query(dailyQuery, params);
    
    // 時間帯別の通話数
    const hourlyQuery = `
      SELECT 
        HOUR(start_time) as hour,
        COUNT(*) as total,
        SUM(CASE WHEN status = 'ANSWERED' THEN 1 ELSE 0 END) as answered
      FROM call_logs
      ${timeFilter}
      GROUP BY HOUR(start_time)
      ORDER BY hour
    `;
    
    const hourlyStats = await db.query(hourlyQuery, params);
    
    // キャンペーン別の通話数
    const campaignQuery = `
      SELECT 
        c.id, c.name,
        COUNT(cl.id) as calls,
        SUM(CASE WHEN cl.status = 'ANSWERED' THEN 1 ELSE 0 END) as answered,
        AVG(cl.duration) as avg_duration
      FROM campaigns c
      LEFT JOIN call_logs cl ON c.id = cl.campaign_id
      ${timeFilter ? timeFilter.replace('WHERE', 'WHERE cl.') : ''}
      GROUP BY c.id
      ORDER BY calls DESC
      LIMIT 10
    `;
    
    const campaignStats = await db.query(campaignQuery, params);
    
    res.json({
      total: totalStats[0],
      daily: dailyStats,
      hourly: hourlyStats,
      campaigns: campaignStats
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;