const db = require('../services/database');
const logger = require('../services/logger');

// キャンペーンレポートの生成
exports.generateCampaignReport = async (req, res) => {
  try {
    const campaignId = req.params.id;
    const { startDate, endDate } = req.query;
    
    // 基本的な統計
    const [stats] = await db.query(`
      SELECT 
        COUNT(*) as total_calls,
        SUM(CASE WHEN status = 'ANSWERED' THEN 1 ELSE 0 END) as answered_calls,
        SUM(CASE WHEN status = 'NO ANSWER' THEN 1 ELSE 0 END) as no_answer_calls,
        SUM(CASE WHEN status = 'BUSY' THEN 1 ELSE 0 END) as busy_calls,
        AVG(CASE WHEN status = 'ANSWERED' THEN duration ELSE NULL END) as avg_duration,
        SUM(CASE WHEN keypress = '1' THEN 1 ELSE 0 END) as operator_requests,
        SUM(CASE WHEN keypress = '9' THEN 1 ELSE 0 END) as dnc_requests
      FROM call_logs
      WHERE campaign_id = ?
        AND start_time BETWEEN ? AND ?
    `, [campaignId, startDate || '1970-01-01', endDate || '2100-12-31']);
    
    // 時間帯別の統計
    const hourlyStats = await db.query(`
      SELECT 
        HOUR(start_time) as hour,
        COUNT(*) as total_calls,
        SUM(CASE WHEN status = 'ANSWERED' THEN 1 ELSE 0 END) as answered_calls
      FROM call_logs
      WHERE campaign_id = ?
        AND start_time BETWEEN ? AND ?
      GROUP BY HOUR(start_time)
      ORDER BY hour
    `, [campaignId, startDate || '1970-01-01', endDate || '2100-12-31']);
    
    // 日別の統計
    const dailyStats = await db.query(`
      SELECT 
        DATE(start_time) as date,
        COUNT(*) as total_calls,
        SUM(CASE WHEN status = 'ANSWERED' THEN 1 ELSE 0 END) as answered_calls
      FROM call_logs
      WHERE campaign_id = ?
        AND start_time BETWEEN ? AND ?
      GROUP BY DATE(start_time)
      ORDER BY date
    `, [campaignId, startDate || '1970-01-01', endDate || '2100-12-31']);
    
    res.json({
      summary: stats,
      hourly: hourlyStats,
      daily: dailyStats
    });
  } catch (error) {
    logger.error('レポート生成エラー:', error);
    res.status(500).json({ message: 'エラーが発生しました' });
  }
};

// CSVエクスポート
exports.exportCampaignData = async (req, res) => {
  try {
    const campaignId = req.params.id;
    
    const calls = await db.query(`
      SELECT 
        cl.start_time as '発信日時',
        c.phone as '電話番号',
        c.name as '名前',
        c.company as '会社名',
        cl.status as 'ステータス',
        cl.duration as '通話時間（秒）',
        cl.keypress as 'キー入力'
      FROM call_logs cl
      JOIN contacts c ON cl.contact_id = c.id
      WHERE cl.campaign_id = ?
      ORDER BY cl.start_time DESC
    `, [campaignId]);
    
    // CSVに変換
    let csv = '発信日時,電話番号,名前,会社名,ステータス,通話時間（秒）,キー入力\n';
    
    calls.forEach(call => {
      csv += `${call['発信日時']},${call['電話番号']},${call['名前'] || ''},${call['会社名'] || ''},${call['ステータス']},${call['通話時間（秒）'] || '0'},${call['キー入力'] || ''}\n`;
    });
    
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=campaign_${campaignId}_report.csv`);
    res.send('\uFEFF' + csv); // BOM付きUTF-8
  } catch (error) {
    logger.error('データエクスポートエラー:', error);
    res.status(500).json({ message: 'エラーが発生しました' });
  }
};