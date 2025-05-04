// backend/src/controllers/reportController.js
const db = require('../services/database');
const logger = require('../services/logger');

// ダッシュボード用レポートデータ
exports.getDashboardReport = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    // パラメータの検証
    const start = startDate || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const end = endDate || new Date().toISOString().split('T')[0];
    
    // 日別統計
    const dailyStats = await db.query(`
      SELECT 
        DATE(start_time) as date,
        COUNT(*) as total,
        SUM(CASE WHEN status = 'ANSWERED' THEN 1 ELSE 0 END) as answered
      FROM call_logs
      WHERE start_time BETWEEN ? AND ?
      GROUP BY DATE(start_time)
      ORDER BY date
    `, [start, end]);
    
    // 時間帯別統計
    const hourlyStats = await db.query(`
      SELECT 
        HOUR(start_time) as hour,
        COUNT(*) as total,
        SUM(CASE WHEN status = 'ANSWERED' THEN 1 ELSE 0 END) as answered,
        ROUND(100.0 * SUM(CASE WHEN status = 'ANSWERED' THEN 1 ELSE 0 END) / COUNT(*), 1) as answerRate
      FROM call_logs
      WHERE start_time BETWEEN ? AND ?
      GROUP BY HOUR(start_time)
      ORDER BY hour
    `, [start, end]);
    
    // ステータス分布
    const statusDistribution = await db.query(`
      SELECT 
        status as name,
        COUNT(*) as value
      FROM call_logs
      WHERE start_time BETWEEN ? AND ?
      GROUP BY status
    `, [start, end]);
    
    // キャンペーン別統計
    const campaignStats = await db.query(`
      SELECT 
        c.id,
        c.name,
        COUNT(cl.id) as totalCalls,
        SUM(CASE WHEN cl.status = 'ANSWERED' THEN 1 ELSE 0 END) as answered,
        ROUND(100.0 * SUM(CASE WHEN cl.status = 'ANSWERED' THEN 1 ELSE 0 END) / COUNT(cl.id), 1) as answerRate,
        ROUND(AVG(CASE WHEN cl.status = 'ANSWERED' THEN cl.duration ELSE NULL END), 1) as avgDuration
      FROM campaigns c
      LEFT JOIN call_logs cl ON c.id = cl.campaign_id
      WHERE cl.start_time BETWEEN ? AND ?
      GROUP BY c.id, c.name
      ORDER BY totalCalls DESC
      LIMIT 10
    `, [start, end]);
    
    // 時間フォーマット処理
    const formattedHourlyStats = hourlyStats.map(stat => ({
      hour: `${stat.hour}:00`,
      answerRate: stat.answerRate || 0
    }));
    
    res.json({
      dailyStats,
      hourlyStats: formattedHourlyStats,
      statusDistribution,
      campaignStats
    });
  } catch (error) {
    logger.error('ダッシュボードレポート取得エラー:', error);
    res.status(500).json({ message: 'エラーが発生しました' });
  }
};