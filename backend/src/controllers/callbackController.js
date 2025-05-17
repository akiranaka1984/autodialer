// backend/src/controllers/callbackController.js
const db = require('../services/database');
const logger = require('../services/logger');
const dialerService = require('../services/dialerService');

// 通話開始時のコールバック
exports.handleCallStart = async (req, res) => {
  try {
    const { callId, campaignId, contactId, number } = req.body;
    
    logger.info(`通話開始コールバック: callId=${callId}, campaignId=${campaignId}, contactId=${contactId}, number=${number}`);
    
    if (!callId) {
      return res.status(400).json({ message: '通話IDが必要です' });
    }
    
    // キャンペーンまたは連絡先IDが渡された場合、それらを検証
    let campaignData = null;
    let contactData = null;
    
    if (campaignId) {
      // キャンペーン情報を取得
      const campaigns = await db.query(
        'SELECT c.*, ci.number as caller_id_number FROM campaigns c JOIN caller_ids ci ON c.caller_id_id = ci.id WHERE c.id = ?',
        [campaignId]
      );
      
      if (campaigns.length > 0) {
        campaignData = campaigns[0];
      }
    }
    
    if (contactId) {
      // 連絡先情報を取得
      const contacts = await db.query(
        'SELECT * FROM contacts WHERE id = ?',
        [contactId]
      );
      
      if (contacts.length > 0) {
        contactData = contacts[0];
        
        // 連絡先ステータスを 'called' に更新
        await db.query(
          'UPDATE contacts SET status = ? WHERE id = ?',
          ['called', contactId]
        );
      }
    }
    
    // 通話ログを記録
    const timestamp = new Date();
    
    await db.query(`
      INSERT INTO call_logs (
        call_id, campaign_id, contact_id, caller_id_id, phone_number,
        start_time, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
      callId,
      campaignData ? campaignData.id : null,
      contactData ? contactData.id : null,
      campaignData ? campaignData.caller_id_id : null,
      number || (contactData ? contactData.phone : null),
      timestamp,
      'active'
    ]);
    
    // 発信サービスに通知
    if (dialerService.handleCallStarted) {
      dialerService.handleCallStarted(callId, campaignId, contactId);
    }
    
    res.json({
      success: true,
      message: '通話開始が記録されました',
      timestamp: timestamp.toISOString()
    });
  } catch (error) {
    logger.error('通話開始コールバックエラー:', error);
    res.status(500).json({ message: `エラー: ${error.message}` });
  }
};

// キーパッド入力時のコールバック
exports.handleKeypress = async (req, res) => {
  try {
    const { callId, keypress, campaignId } = req.body;
    
    logger.info(`キーパッド入力コールバック: callId=${callId}, keypress=${keypress}, campaignId=${campaignId}`);
    
    if (!callId) {
      return res.status(400).json({ message: '通話IDが必要です' });
    }
    
    // 通話ログの更新
    const [result] = await db.query(
      'UPDATE call_logs SET keypress = ? WHERE call_id = ?',
      [keypress, callId]
    );
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: '指定された通話IDが見つかりません' });
    }
    
    // キーパッド入力に基づく処理
    switch (keypress) {
      case '1':
        // オペレーターへの転送処理
        await operatorService.assignCallToOperator(callId, campaignId);
        break;
      
      case '9':
        // DNCリストに追加
        await handleDncRequest(callId);
        break;
      
      default:
        // その他のキー入力処理
        break;
    }
    
    // WebSocketを通じてリアルタイム通知
    websocketService.notifyKeypress(callId, keypress);
    
    res.json({
      success: true,
      message: 'キーパッド入力が記録されました',
      action: keypress === '1' ? 'operator-transfer' : 
              keypress === '9' ? 'add-to-dnc' : 'none'
    });
  } catch (error) {
    logger.error('キーパッド入力コールバックエラー:', error);
    res.status(500).json({ message: `エラー: ${error.message}` });
  }
};

// 通話終了時のコールバック
exports.handleCallEnd = async (req, res) => {
  try {
    const { callId, duration, disposition, keypress } = req.body;
    
    logger.info(`通話終了コールバック: callId=${callId}, duration=${duration}, disposition=${disposition}, keypress=${keypress}`);
    
    if (!callId) {
      return res.status(400).json({ message: '通話IDが必要です' });
    }
    
    // 通話ログの取得
    const callLogs = await db.query(
      'SELECT * FROM call_logs WHERE call_id = ?',
      [callId]
    );
    
    if (callLogs.length === 0) {
      return res.status(404).json({ message: '指定された通話IDが見つかりません' });
    }
    
    const callLog = callLogs[0];
    
    // 通話ログの更新
    await db.query(`
      UPDATE call_logs
      SET end_time = NOW(), duration = ?, status = ?, keypress = ?
      WHERE call_id = ?
    `, [
      duration || 0,
      disposition || 'COMPLETED',
      keypress || callLog.keypress,
      callId
    ]);
    
    // 連絡先の状態を更新
    if (callLog.contact_id) {
      let contactStatus = 'completed';
      
      // キーパッド入力が9の場合はDNC（発信拒否）としてマーク
      if (keypress === '9' || callLog.keypress === '9') {
        contactStatus = 'dnc';
        
        // DNCリストに追加
        const contacts = await db.query(
          'SELECT phone FROM contacts WHERE id = ?',
          [callLog.contact_id]
        );
        
        if (contacts.length > 0) {
          await db.query(
            'INSERT IGNORE INTO dnc_list (phone, reason, created_at) VALUES (?, ?, NOW())',
            [contacts[0].phone, 'ユーザーリクエスト（キーパッド入力9）']
          );
        }
      }
      
      await db.query(
        'UPDATE contacts SET status = ? WHERE id = ?',
        [contactStatus, callLog.contact_id]
      );
    }
    
    // 発信サービスに通知
    if (dialerService.handleCallEnded) {
      dialerService.handleCallEnded(callId, duration, disposition, keypress);
    }
    
    res.json({
      success: true,
      message: '通話終了が記録されました'
    });
  } catch (error) {
    logger.error('通話終了コールバックエラー:', error);
    res.status(500).json({ message: `エラー: ${error.message}` });
  }
};

// 通話統計API
exports.getCallStats = async (req, res) => {
  try {
    const { campaignId, period } = req.query;
    
    // クエリパラメータの検証
    if (campaignId && !/^\d+$/.test(campaignId)) {
      return res.status(400).json({ message: 'キャンペーンIDは数値である必要があります' });
    }
    
    // 期間フィルターの設定
    let timeFilter = '';
    let timeParams = [];
    
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
      
      timeFilter = ' AND start_time BETWEEN ? AND ?';
      timeParams = [startDate, now];
    }
    
    // キャンペーンフィルター
    let campaignFilter = '';
    let campaignParams = [];
    
    if (campaignId) {
      campaignFilter = ' AND campaign_id = ?';
      campaignParams = [campaignId];
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
        AVG(duration) as avg_duration,
        SUM(CASE WHEN keypress = '1' THEN 1 ELSE 0 END) as operator_requested,
        SUM(CASE WHEN keypress = '9' THEN 1 ELSE 0 END) as dnc_requested
      FROM call_logs
      WHERE 1=1${campaignFilter}${timeFilter}
    `;
    
    const [totalStats] = await db.query(totalQuery, [...campaignParams, ...timeParams]);
    
    // 時間帯別の発信数を取得
    const hourlyQuery = `
      SELECT 
        HOUR(start_time) as hour,
        COUNT(*) as calls,
        SUM(CASE WHEN status = 'ANSWERED' THEN 1 ELSE 0 END) as answered
      FROM call_logs
      WHERE 1=1${campaignFilter}${timeFilter}
      GROUP BY HOUR(start_time)
      ORDER BY hour
    `;
    
    const hourlyStats = await db.query(hourlyQuery, [...campaignParams, ...timeParams]);
    
    // キャンペーン別の発信数を取得（キャンペーンIDが指定されていない場合のみ）
    let campaignStats = [];
    
    if (!campaignId) {
      const campaignQuery = `
        SELECT 
          c.id, c.name,
          COUNT(cl.id) as calls,
          SUM(CASE WHEN cl.status = 'ANSWERED' THEN 1 ELSE 0 END) as answered,
          AVG(cl.duration) as avg_duration
        FROM campaigns c
        LEFT JOIN call_logs cl ON c.id = cl.campaign_id
        WHERE 1=1${timeFilter}
        GROUP BY c.id
        ORDER BY calls DESC
        LIMIT 10
      `;
      
      campaignStats = await db.query(campaignQuery, timeParams);
    }
    
    res.json({
      total: totalStats[0],
      hourly: hourlyStats,
      campaigns: campaignStats
    });
  } catch (error) {
    logger.error('通話統計取得エラー:', error);
    res.status(500).json({ message: `エラー: ${error.message}` });
  }
};

// DNCリスト追加処理
async function handleDncRequest(callId) {
  try {
    // 通話ログから連絡先情報を取得
    const [callLogs] = await db.query(
      'SELECT cl.contact_id, c.phone FROM call_logs cl LEFT JOIN contacts c ON cl.contact_id = c.id WHERE cl.call_id = ?',
      [callId]
    );
    
    if (callLogs.length === 0 || !callLogs[0].phone) {
      logger.warn(`DNC追加エラー: 通話ID ${callId} に対応する連絡先が見つかりません`);
      return false;
    }
    
    const contactPhone = callLogs[0].phone;
    
    // DNCリストに追加
    await db.query(
      'INSERT IGNORE INTO dnc_list (phone, reason, created_at) VALUES (?, ?, NOW())',
      [contactPhone, 'ユーザーリクエスト（キーパッド入力9）']
    );
    
    // 連絡先のステータスを更新
    if (callLogs[0].contact_id) {
      await db.query(
        'UPDATE contacts SET status = ? WHERE id = ?',
        ['dnc', callLogs[0].contact_id]
      );
    }
    
    logger.info(`DNCリストに追加されました: ${contactPhone}`);
    return true;
  } catch (error) {
    logger.error('DNC追加処理エラー:', error);
    return false;
  }
};