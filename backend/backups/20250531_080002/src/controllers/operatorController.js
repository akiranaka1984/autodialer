// backend/src/controllers/operatorController.js
const db = require('../services/database');
const logger = require('../services/logger');
const callQueueService = require('../services/callQueueService');
const dialerService = require('../services/dialerService');

// 全オペレーター一覧を取得
exports.getAllOperators = async (req, res) => {
  try {
    // オペレーター一覧を取得
    const [operators] = await db.query(`
      SELECT o.*, u.name, u.email, u.username
      FROM operators o
      JOIN users u ON o.user_id = u.id
      ORDER BY o.created_at DESC
    `);
    
    res.json(operators);
  } catch (error) {
    logger.error('オペレーター一覧取得エラー:', error);
    res.status(500).json({ message: 'エラーが発生しました' });
  }
};

// オペレーターの詳細情報を取得
exports.getOperatorById = async (req, res) => {
  try {
    const operatorId = req.params.id;
    
    // オペレーター情報を取得
    const [operators] = await db.query(`
      SELECT o.*, u.name, u.email, u.username
      FROM operators o
      JOIN users u ON o.user_id = u.id
      WHERE o.id = ?
    `, [operatorId]);
    
    if (operators.length === 0) {
      return res.status(404).json({ message: 'オペレーターが見つかりません' });
    }
    
    // オペレーターの通話統計を取得
    const [callStats] = await db.query(`
      SELECT 
        COUNT(*) as total_calls,
        SUM(CASE WHEN ocl.disposition = 'completed' THEN 1 ELSE 0 END) as completed_calls,
        SUM(CASE WHEN ocl.disposition = 'transferred' THEN 1 ELSE 0 END) as transferred_calls,
        AVG(ocl.duration) as avg_duration,
        AVG(ocl.customer_satisfaction) as avg_satisfaction
      FROM operator_call_logs ocl
      WHERE ocl.operator_id = ?
    `, [operatorId]);
    
    // 最近の通話履歴を取得
    const [recentCalls] = await db.query(`
      SELECT ocl.*, cl.call_id, cl.phone_number, c.name as contact_name, c.company as contact_company,
             ca.name as campaign_name
      FROM operator_call_logs ocl
      JOIN call_logs cl ON ocl.call_log_id = cl.id
      LEFT JOIN contacts c ON cl.contact_id = c.id
      LEFT JOIN campaigns ca ON cl.campaign_id = ca.id
      WHERE ocl.operator_id = ?
      ORDER BY ocl.start_time DESC
      LIMIT 5
    `, [operatorId]);
    
    // 結果を整形して返す
    const result = {
      ...operators[0],
      statistics: callStats[0],
      recentCalls
    };
    
    res.json(result);
  } catch (error) {
    logger.error('オペレーター詳細取得エラー:', error);
    res.status(500).json({ message: 'エラーが発生しました' });
  }
};

// オペレーターのステータスを更新
exports.updateOperatorStatus = async (req, res) => {
  try {
    const operatorId = req.params.id;
    const { status, reason } = req.body;
    
    if (!['available', 'busy', 'offline', 'break'].includes(status)) {
      return res.status(400).json({ message: '無効なステータスです' });
    }
    
    // オペレーター情報を取得
    const [operators] = await db.query(
      'SELECT * FROM operators WHERE id = ?',
      [operatorId]
    );
    
    if (operators.length === 0) {
      return res.status(404).json({ message: 'オペレーターが見つかりません' });
    }
    
    const operator = operators[0];
    const oldStatus = operator.status;
    
    // ステータスが変わらない場合は何もしない
    if (oldStatus === status) {
      return res.json({
        message: 'ステータスは既に更新されています',
        operator: operator
      });
    }
    
    // データベースのステータスを更新
    await db.query(
      'UPDATE operators SET status = ?, updated_at = NOW() WHERE id = ?',
      [status, operatorId]
    );
    
    // ステータス履歴に記録
    await db.query(
      'INSERT INTO operator_status_logs (operator_id, old_status, new_status, reason, changed_at) VALUES (?, ?, ?, ?, NOW())',
      [operatorId, oldStatus, status, reason || null]
    );
    
    // キューのメンバーシップを更新
    if (status === 'available') {
      // キューに追加または状態更新
      await callQueueService.addOperatorToQueue(operatorId, operator.sip_account);
    } else if (status === 'busy') {
      // 一時停止
      await callQueueService.pauseOperator(operatorId);
    } else {
      // キューから削除
      await callQueueService.removeOperatorFromQueue(operatorId);
    }
    
    // 発信率を調整
    await callQueueService.adjustOutboundCallRate();
    
    // 更新後のオペレーター情報を取得
    const [updatedOperators] = await db.query(
      'SELECT * FROM operators WHERE id = ?',
      [operatorId]
    );
    
    res.json({
      message: 'オペレーターステータスを更新しました',
      operator: updatedOperators[0]
    });
  } catch (error) {
    logger.error('オペレーターステータス更新エラー:', error);
    res.status(500).json({ message: 'エラーが発生しました' });
  }
};

// オペレーターの統計情報を取得
exports.getOperatorStats = async (req, res) => {
  try {
    const operatorId = req.params.id;
    const { period } = req.query; // day, week, month, all
    
    // 期間に応じたフィルタを構築
    let timeFilter = '';
    let params = [operatorId];
    
    if (period) {
      const now = new Date();
      let startDate = new Date();
      
      switch (period) {
        case 'day':
          startDate.setHours(0, 0, 0, 0);
          break;
        case 'week':
          startDate.setDate(startDate.getDate() - 7);
          break;
        case 'month':
          startDate.setMonth(startDate.getMonth() - 1);
          break;
        default: // 'all' または無効な値
          startDate = null;
          break;
      }
      
      if (startDate) {
        timeFilter = ' AND ocl.start_time >= ?';
        params.push(startDate);
      }
    }
    
    // 通話統計
    const [callStats] = await db.query(`
      SELECT 
        COUNT(*) as total_calls,
        SUM(CASE WHEN ocl.disposition = 'completed' THEN 1 ELSE 0 END) as completed_calls,
        SUM(CASE WHEN ocl.disposition = 'transferred' THEN 1 ELSE 0 END) as transferred_calls,
        AVG(ocl.duration) as avg_duration,
        AVG(ocl.customer_satisfaction) as avg_satisfaction
      FROM operator_call_logs ocl
      WHERE ocl.operator_id = ?${timeFilter}
    `, params);
    
    // 日別の通話数
    const [dailyStats] = await db.query(`
      SELECT 
        DATE(ocl.start_time) as date,
        COUNT(*) as calls
      FROM operator_call_logs ocl
      WHERE ocl.operator_id = ?${timeFilter}
      GROUP BY DATE(ocl.start_time)
      ORDER BY date DESC
      LIMIT 30
    `, params);
    
    // 時間帯別の通話数
    const [hourlyStats] = await db.query(`
      SELECT 
        HOUR(ocl.start_time) as hour,
        COUNT(*) as calls
      FROM operator_call_logs ocl
      WHERE ocl.operator_id = ?${timeFilter}
      GROUP BY HOUR(ocl.start_time)
      ORDER BY hour
    `, params);
    
    // キャンペーン別の通話数
    const [campaignStats] = await db.query(`
      SELECT 
        ca.id, ca.name,
        COUNT(ocl.id) as calls,
        AVG(ocl.duration) as avg_duration,
        AVG(ocl.customer_satisfaction) as avg_satisfaction
      FROM operator_call_logs ocl
      JOIN call_logs cl ON ocl.call_log_id = cl.id
      JOIN campaigns ca ON cl.campaign_id = ca.id
      WHERE ocl.operator_id = ?${timeFilter}
      GROUP BY ca.id
      ORDER BY calls DESC
    `, params);
    
    // ステータス履歴
    const [statusHistory] = await db.query(`
      SELECT 
        osl.old_status,
        osl.new_status,
        osl.reason,
        osl.changed_at
      FROM operator_status_logs osl
      WHERE osl.operator_id = ?
      ORDER BY osl.changed_at DESC
      LIMIT 10
    `, [operatorId]);
    
    res.json({
      callStats: callStats[0],
      dailyStats,
      hourlyStats,
      campaignStats,
      statusHistory
    });
  } catch (error) {
    logger.error('オペレーター統計取得エラー:', error);
    res.status(500).json({ message: 'エラーが発生しました' });
  }
};

// オペレーターを新規作成
exports.createOperator = async (req, res) => {
  try {
    const { user_id, operator_id, sip_account, skills, max_concurrent_calls, priority } = req.body;
    
    // 入力検証
    if (!user_id || !operator_id || !sip_account) {
      return res.status(400).json({ message: 'ユーザーID、オペレーターID、SIPアカウントは必須です' });
    }
    
    // ユーザーの存在確認
    const [users] = await db.query(
      'SELECT id FROM users WHERE id = ?',
      [user_id]
    );
    
    if (users.length === 0) {
      return res.status(404).json({ message: 'ユーザーが見つかりません' });
    }
    
    // オペレーターIDの重複チェック
    const [existingOperators] = await db.query(
      'SELECT id FROM operators WHERE operator_id = ?',
      [operator_id]
    );
    
    if (existingOperators.length > 0) {
      return res.status(400).json({ message: 'このオペレーターIDは既に使用されています' });
    }
    
    // SIPアカウントの重複チェック
    const [existingSipAccounts] = await db.query(
      'SELECT id FROM operators WHERE sip_account = ?',
      [sip_account]
    );
    
    if (existingSipAccounts.length > 0) {
      return res.status(400).json({ message: 'このSIPアカウントは既に使用されています' });
    }
    
    // スキルをJSONに変換
    const skillsJson = skills ? JSON.stringify(skills) : null;
    
    // オペレーターを作成
    const [result] = await db.query(
      `INSERT INTO operators 
       (user_id, operator_id, status, sip_account, skills, max_concurrent_calls, priority, created_at)
       VALUES (?, ?, 'offline', ?, ?, ?, ?, NOW())`,
      [user_id, operator_id, sip_account, skillsJson, max_concurrent_calls || 1, priority || 1]
    );
    
    // ユーザーのロールを更新（必要に応じて）
    await db.query(
      'UPDATE users SET role = ? WHERE id = ? AND role != "admin"',
      ['operator', user_id]
    );
    
    // 作成されたオペレーターの情報を取得
    const [operators] = await db.query(
      'SELECT * FROM operators WHERE id = ?',
      [result.insertId]
    );
    
    res.status(201).json({
      message: 'オペレーターを作成しました',
      operator: operators[0]
    });
  } catch (error) {
    logger.error('オペレーター作成エラー:', error);
    res.status(500).json({ message: 'エラーが発生しました' });
  }
};

// オペレーターを削除
exports.deleteOperator = async (req, res) => {
  try {
    const operatorId = req.params.id;
    
    // オペレーターの存在確認
    const [operators] = await db.query(
      'SELECT * FROM operators WHERE id = ?',
      [operatorId]
    );
    
    if (operators.length === 0) {
      return res.status(404).json({ message: 'オペレーターが見つかりません' });
    }
    
    // キューからオペレーターを削除
    await callQueueService.removeOperatorFromQueue(operatorId);
    
    // オペレーターを削除
    await db.query(
      'DELETE FROM operators WHERE id = ?',
      [operatorId]
    );
    
    res.json({
      message: 'オペレーターを削除しました'
    });
  } catch (error) {
    logger.error('オペレーター削除エラー:', error);
    res.status(500).json({ message: 'エラーが発生しました' });
  }
};

// 通話処理（オペレーター用）
exports.handleCallAction = async (req, res) => {
  try {
    const { action } = req.params;
    const { callId, notes, disposition, satisfaction } = req.body;
    const operatorId = req.user.operator_id; // JWT認証からオペレーターIDを取得
    
    if (!callId) {
      return res.status(400).json({ message: '通話IDが必要です' });
    }
    
    // オペレーター情報を取得
    const [operators] = await db.query(
      'SELECT * FROM operators WHERE id = ?',
      [operatorId]
    );
    
    if (operators.length === 0) {
      return res.status(404).json({ message: 'オペレーターが見つかりません' });
    }
    
    switch (action) {
      case 'accept':
        // 通話を受け入れる処理
        // 通話ログを更新
        await db.query(
          'UPDATE call_logs SET transfer_status = ? WHERE call_id = ?',
          ['accepted', callId]
        );
        
        // オペレーター通話ログを作成
        await db.query(
          `INSERT INTO operator_call_logs 
           (operator_id, call_log_id, start_time) 
           SELECT ?, id, NOW() FROM call_logs WHERE call_id = ?`,
          [operatorId, callId]
        );
        
        // オペレーターのステータスを'busy'に更新
        await this.updateOperatorStatus({ params: { id: operatorId }, body: { status: 'busy', reason: '通話中' } }, {
          json: () => {},
          status: () => { return { json: () => {} }; }
        });
        
        res.json({
          success: true,
          message: '通話を受け入れました'
        });
        break;
        
      case 'complete':
        // 通話を完了する処理
        // オペレーター通話ログを更新
        await db.query(
          `UPDATE operator_call_logs 
           SET end_time = NOW(), 
               duration = TIMESTAMPDIFF(SECOND, start_time, NOW()),
               disposition = ?,
               notes = ?,
               customer_satisfaction = ?
           WHERE operator_id = ? AND call_log_id = (SELECT id FROM call_logs WHERE call_id = ?)`,
          [disposition || 'completed', notes || null, satisfaction || null, operatorId, callId]
        );
        
        // 通話ログを更新
        await db.query(
          'UPDATE call_logs SET transfer_status = ?, transfer_notes = ? WHERE call_id = ?',
          ['completed', notes || null, callId]
        );
        
        // オペレーターのステータスを'available'に更新
        await this.updateOperatorStatus({ params: { id: operatorId }, body: { status: 'available', reason: '通話完了' } }, {
          json: () => {},
          status: () => { return { json: () => {} }; }
        });
        
        res.json({
          success: true,
          message: '通話を完了しました'
        });
        break;
        
      case 'transfer':
        // 他のオペレーターに転送する処理
        // 現実装では省略
        res.status(501).json({
          success: false,
          message: '転送機能は現在実装されていません'
        });
        break;
        
      default:
        res.status(400).json({
          success: false,
          message: '無効なアクションです'
        });
    }
  } catch (error) {
    logger.error('通話処理エラー:', error);
    res.status(500).json({ message: 'エラーが発生しました' });
  }
};

// オペレーターの割り当て
exports.assignOperator = async (req, res) => {
  try {
    const { callId, skills } = req.body;
    
    if (!callId) {
      return res.status(400).json({ message: '通話IDが必要です' });
    }
    
    // 通話の存在確認
    const [calls] = await db.query(
      'SELECT * FROM call_logs WHERE call_id = ?',
      [callId]
    );
    
    if (calls.length === 0) {
      return res.status(404).json({ message: '通話が見つかりません' });
    }
    
    // オペレーターへの転送処理
    const result = await callQueueService.transferToOperator(callId, calls[0].campaign_id, {
      includeCustomerInfo: true,
      skills: skills
    });
    
    if (!result.success) {
      return res.status(400).json({
        message: result.message || 'オペレーターへの転送に失敗しました',
        reason: result.reason
      });
    }
    
    res.json({
      success: true,
      message: 'オペレーターへの転送を開始しました',
      queuePosition: result.queuePosition,
      estimatedWaitTime: result.estimatedWaitTime,
      customerInfo: result.customerInfo
    });
  } catch (error) {
    logger.error('オペレーター割り当てエラー:', error);
    res.status(500).json({ message: 'エラーが発生しました' });
  }
};