// backend/src/controllers/operatorController.js

const db = require('../services/database');
const logger = require('../services/logger');
const websocketService = require('../services/websocketService');

// オペレーター一覧取得
exports.getAllOperators = async (req, res) => {
  try {
    const [operators] = await db.query(`
      SELECT 
        o.*,
        u.name as user_name,
        u.email as user_email,
        COUNT(ocl.id) as total_calls_handled,
        AVG(ocl.customer_satisfaction) as avg_satisfaction
      FROM operators o
      JOIN users u ON o.user_id = u.id
      LEFT JOIN operator_call_logs ocl ON o.id = ocl.operator_id
      GROUP BY o.id
      ORDER BY o.operator_id
    `);
    
    res.json(operators);
  } catch (error) {
    logger.error('オペレーター一覧取得エラー:', error);
    res.status(500).json({ message: 'サーバーエラーが発生しました' });
  }
};

// オペレーターのステータス更新
exports.updateOperatorStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, reason } = req.body;
    
    // 現在のステータスを取得
    const [currentOperator] = await db.query(
      'SELECT status FROM operators WHERE id = ?',
      [id]
    );
    
    if (currentOperator.length === 0) {
      return res.status(404).json({ message: 'オペレーターが見つかりません' });
    }
    
    // ステータスを更新
    await db.query(
      'UPDATE operators SET status = ?, updated_at = NOW() WHERE id = ?',
      [status, id]
    );
    
    // ステータス変更履歴を記録
    await db.query(
      'INSERT INTO operator_status_logs (operator_id, old_status, new_status, reason) VALUES (?, ?, ?, ?)',
      [id, currentOperator[0].status, status, reason]
    );
    
    // WebSocketで通知
    websocketService.notifyOperatorStatusChange(id, status, reason);
    
    res.json({ message: 'ステータスが更新されました' });
  } catch (error) {
    logger.error('オペレーターステータス更新エラー:', error);
    res.status(500).json({ message: 'サーバーエラーが発生しました' });
  }
};

// オペレーターの統計情報取得
exports.getOperatorStats = async (req, res) => {
  try {
    const { id } = req.params;
    const { startDate, endDate } = req.query;
    
    const [stats] = await db.query(`
      SELECT 
        COUNT(*) as total_calls,
        AVG(duration) as avg_call_duration,
        SUM(CASE WHEN disposition = 'completed' THEN 1 ELSE 0 END) as completed_calls,
        AVG(customer_satisfaction) as avg_satisfaction,
        MIN(start_time) as first_call,
        MAX(end_time) as last_call
      FROM operator_call_logs
      WHERE operator_id = ?
        AND start_time BETWEEN ? AND ?
    `, [id, startDate || '1970-01-01', endDate || '2099-12-31']);
    
    res.json(stats[0]);
  } catch (error) {
    logger.error('オペレーター統計取得エラー:', error);
    res.status(500).json({ message: 'サーバーエラーが発生しました' });
  }
};

// オペレーターの自動割り当て
exports.assignOperator = async (req, res) => {
  try {
    const { callId, skills } = req.body;
    
    // 利用可能なオペレーターを検索
    let query = `
      SELECT o.* 
      FROM operators o
      JOIN operator_shifts os ON o.id = os.operator_id
      WHERE o.status = 'available'
        AND os.shift_date = CURDATE()
        AND CURTIME() BETWEEN os.start_time AND os.end_time
        AND (os.break_start IS NULL OR CURTIME() NOT BETWEEN os.break_start AND os.break_end)
    `;
    
    const params = [];
    
    // スキルフィルター
    if (skills && skills.length > 0) {
      query += ' AND JSON_CONTAINS(o.skills, ?)';
      params.push(JSON.stringify(skills));
    }
    
    query += ' ORDER BY o.priority DESC, RAND() LIMIT 1';
    
    const [availableOperators] = await db.query(query, params);
    
    if (availableOperators.length === 0) {
      return res.status(404).json({ message: '利用可能なオペレーターがいません' });
    }
    
    const operator = availableOperators[0];
    
    // オペレーターを割り当て
    await db.query(
      'UPDATE operators SET status = "busy", current_call_id = ? WHERE id = ?',
      [callId, operator.id]
    );
    
    // 通話ログを作成
    await db.query(
      'INSERT INTO operator_call_logs (operator_id, call_log_id, start_time) VALUES (?, ?, NOW())',
      [operator.id, callId]
    );
    
    res.json({ operator });
  } catch (error) {
    logger.error('オペレーター割り当てエラー:', error);
    res.status(500).json({ message: 'サーバーエラーが発生しました' });
  }
};
// オペレーター自身のステータス更新
exports.updateOperatorStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const userId = req.user.id;
    
    // ユーザーIDからオペレーターIDを取得
    const [operator] = await db.query(
      'SELECT id FROM operators WHERE user_id = ?',
      [userId]
    );
    
    if (operator.length === 0) {
      return res.status(404).json({ message: 'オペレーターが見つかりません' });
    }
    
    // ステータスを更新
    await db.query(
      'UPDATE operators SET status = ?, updated_at = NOW() WHERE id = ?',
      [status, operator[0].id]
    );
    
    // WebSocketで通知
    websocketService.notifyOperatorStatusChange(operator[0].id, status);
    
    res.json({ message: 'ステータスが更新されました' });
  } catch (error) {
    logger.error('オペレーターステータス更新エラー:', error);
    res.status(500).json({ message: 'サーバーエラーが発生しました' });
  }
};

// 通話アクションの処理
exports.handleCallAction = async (req, res) => {
  try {
    const { action } = req.params;
    const { callId } = req.body;
    const userId = req.user.id;
    
    const [operator] = await db.query(
      'SELECT id FROM operators WHERE user_id = ?',
      [userId]
    );
    
    if (operator.length === 0) {
      return res.status(404).json({ message: 'オペレーターが見つかりません' });
    }
    
    switch (action) {
      case 'accept':
        await db.query(
          'UPDATE operators SET status = "busy", current_call_id = ? WHERE id = ?',
          [callId, operator[0].id]
        );
        break;
        
      case 'end':
        await db.query(
          'UPDATE operators SET status = "available", current_call_id = NULL WHERE id = ?',
          [operator[0].id]
        );
        
        // 通話ログを更新
        await db.query(
          'UPDATE operator_call_logs SET end_time = NOW(), disposition = "completed" WHERE operator_id = ? AND call_log_id = ?',
          [operator[0].id, callId]
        );
        break;
        
      default:
        return res.status(400).json({ message: '無効なアクションです' });
    }
    
    res.json({ message: `通話アクション ${action} を実行しました` });
  } catch (error) {
    logger.error('通話アクションエラー:', error);
    res.status(500).json({ message: 'サーバーエラーが発生しました' });
  }
};